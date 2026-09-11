def check_dearrow_preferences
  invalid = fixture_env("/api/v1/dearrow/invalid")
  invalid.params.url["id"] = "invalid"
  response = Invidious::Routes::API::V1::DeArrow.title(invalid)
  raise "Invalid ID accepted" unless invalid.response.status_code == 400 && JSON.parse(response)["error"]?
  raise "Wrong API content type" unless invalid.response.content_type == "application/json"

  defaults = Preferences.from_json("{}")
  raise "DeArrow must be opt-in" if defaults.dearrow_enabled
  raise "Original title default missing" unless defaults.dearrow_show_original
  yaml = Preferences.from_yaml("{}")
  raise "Old YAML preferences failed" if yaml.dearrow_enabled || !yaml.dearrow_show_original
  raise "Config default failed" if ConfigPreferences.from_yaml("{}").dearrow_enabled

  {true, false}.each do |enabled|
    {true, false}.each do |original|
      body = "save_player_pos=on"
      body += "&dearrow_enabled=on" if enabled
      body += "&dearrow_show_original=on" if original
      env = theme_post_env(body)
      Invidious::Routes::PreferencesRoute.update(env)
      prefs = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
      raise "Guest preferences lost" unless prefs.dearrow_enabled == enabled && prefs.dearrow_show_original == original
      roundtrip = Preferences.from_yaml(prefs.to_yaml)
      raise "YAML preferences lost" unless roundtrip.dearrow_enabled == enabled && roundtrip.dearrow_show_original == original

      user = signed_in_env("/preferences").get("user").as(User)
      env = theme_post_env(body)
      env.set "user", user
      Invidious::Routes::PreferencesRoute.update(env)
      stored = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
      # Load another session from stored account data, rather than reusing the mutated object.
      other = signed_in_env("/preferences").get("user").as(User)
      other.preferences = Preferences.from_json(stored)
      raise "Account preferences lost" unless other.preferences.dearrow_enabled == enabled && other.preferences.dearrow_show_original == original
      api = theme_post_env(prefs.to_json, "application/json")
      api.set "user", other
      Invidious::Routes::API::V1::Authenticated.set_preferences(api)
      stored = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
      other.preferences = Preferences.from_json(stored)
      api.set "user", other
      fetched = Preferences.from_json(Invidious::Routes::API::V1::Authenticated.get_preferences(api))
      raise "API preferences lost" unless fetched.dearrow_enabled == enabled && fetched.dearrow_show_original == original
    end
  end
end

def dearrow_post(path, fields, signed = true, valid_csrf = true)
  token = generate_response("dearrow-session", {"POST:dearrow_submit", "POST:dearrow_identity"}, HMAC_KEY)
  fields["csrf_token"] = valid_csrf ? token : "invalid"
  body = URI::Params.encode(fields)
  env = HTTP::Server::Context.new(HTTP::Request.new("POST", path, HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded"}, body), HTTP::Server::Response.new(IO::Memory.new))
  env.set "preferences", Preferences.from_json("{}")
  if signed
    env.set "user", signed_in_env(path).get("user").as(User)
    env.set "sid", "dearrow-session"
  end
  env
end

def check_dearrow_contributions(output)
  CONFIG.dearrow_identity_key = "ab" * 32
  PG_DB.exec("PRAGMA foreign_keys = ON")
  PG_DB.exec("CREATE TABLE dearrow_identities (email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE, ciphertext TEXT NOT NULL)")
  email = "viewer@example.test"
  id = Invidious::Database::DeArrowIdentities.identity(email, CONFIG.dearrow_identity_key)
  raise "Identity changed between sessions" unless Invidious::Database::DeArrowIdentities.identity(email, CONFIG.dearrow_identity_key) == id
  encrypted = PG_DB.query_one("SELECT ciphertext FROM dearrow_identities WHERE email = ?", email, as: String)
  raise "Unencrypted identity" if encrypted.includes?(id)
  env = dearrow_post("/dearrow_identity", {"private_id" => "c" * 64})
  Invidious::Routes::DeArrowContributions.identity(env)
  raise "Import failed" unless env.response.status_code == 302
  raise "Imported identity lost" unless Invidious::Database::DeArrowIdentities.identity(email, CONFIG.dearrow_identity_key) == "c" * 64
  env = dearrow_post("/dearrow_identity", {"private_id" => ""})
  Invidious::Routes::DeArrowContributions.identity(env)
  raise "Blank replaced identity" unless Invidious::Database::DeArrowIdentities.identity(email, CONFIG.dearrow_identity_key) == "c" * 64
  {false, true}.each do |signed|
    env = dearrow_post("/dearrow_identity", {"private_id" => "d" * 64}, signed, false)
    Invidious::Routes::DeArrowContributions.identity(env)
    raise "Identity import not protected" unless env.response.status_code == 403
  end
  writes = 0
  client = Invidious::DeArrow::Contributions.new(->(method : String, _path : String, body : String?) {
    if method == "GET"
      HTTP::Client::Response.new(200, body: {"abcdefghijk" => {titles: [
        {title: "A >raw title", original: false, votes: -1, locked: false, UUID: "proposal"},
        {title: "Locked", original: false, votes: 3, locked: true, UUID: "locked"},
      ]}}.to_json)
    else
      writes += 1
      data = JSON.parse(body.not_nil!)
      raise "Client can override identity" unless data["userID"] == "c" * 64
      raise "Raw title lost" unless data["title"]["title"] == "A >raw title"
      HTTP::Client::Response.new(200)
    end
  })
  fields = {"video_id" => "abcdefghijk", "action" => "upvote", "uuid" => "proposal", "userID" => "attacker"}
  env = dearrow_post("/dearrow_submit", fields.dup)
  response = Invidious::Routes::DeArrowContributions.submit(env, client)
  raise "Vote failed" unless env.response.status_code == 200 && JSON.parse(response)["ok"] == true && writes == 1
  [
    {"action" => "submit", "title" => "No acknowledgement"},
    {"action" => "submit", "title" => "x" * 111, "confirmed" => "true"},
    {"action" => "downvote", "original" => "true"},
    {"action" => "downvote", "uuid" => "locked"},
    {"action" => "upvote", "uuid" => "missing"},
    {"action" => "nonsense"},
  ].each do |changes|
    env = dearrow_post("/dearrow_submit", fields.merge(changes))
    Invidious::Routes::DeArrowContributions.submit(env, client)
    raise "Invalid vote accepted" unless env.response.status_code >= 400 && writes == 1
  end
  {false, true}.each do |signed|
    env = dearrow_post("/dearrow_submit", fields.dup, signed, false)
    Invidious::Routes::DeArrowContributions.submit(env, client)
    raise "Unprotected vote" unless env.response.status_code == 403 && writes == 1
  end
  env = dearrow_post("/dearrow_submit", fields.merge({"padding" => "x" * 9000}))
  Invidious::Routes::DeArrowContributions.submit(env, client)
  raise "Oversized body accepted" unless env.response.status_code == 413 && writes == 1
  env = fixture_env("/api/v1/dearrow/abcdefghijk/submissions")
  env.params.url["id"] = "abcdefghijk"
  Invidious::Routes::API::V1::DeArrow.submissions(env)
  raise "Anonymous submissions access accepted" unless env.response.status_code == 403
  saved_key = CONFIG.dearrow_identity_key
  CONFIG.dearrow_identity_key = ""
  env = dearrow_post("/dearrow_submit", fields.dup)
  Invidious::Routes::DeArrowContributions.submit(env, client)
  raise "Unconfigured encryption accepted" unless env.response.status_code == 503 && writes == 1
  CONFIG.dearrow_identity_key = saved_key
  env = signed_in_env("/watch?v=2isYuQZMbdU")
  File.write("#{output}/watch-dearrow-contributions.html", watch_fixture(env, account: true))
  {"light", "diary", "cinematic"}.each do |theme|
    env = signed_in_env("/watch?v=2isYuQZMbdU")
    prefs = env.get("preferences").as(Preferences)
    prefs.dark_mode = "light"
    prefs.theme = theme == "light" ? "modern-neon" : theme
    env.set "preferences", prefs
    File.write("#{output}/watch-dearrow-contributions-#{theme}.html", watch_fixture(env, account: true))
  end
  env = signed_in_env("/preferences")
  page = preferences_fixture(env)
  raise "Private ID in preferences HTML" if page.includes?("c" * 64)
  raise "Private ID in preferences JSON" if env.get("user").as(User).preferences.to_json.includes?("c" * 64)
  File.write("#{output}/preferences-dearrow-contributions.html", page)
  PG_DB.exec("INSERT INTO users VALUES (?, ?)", "deleted@example.test", "{}")
  Invidious::Database::DeArrowIdentities.identity("deleted@example.test", CONFIG.dearrow_identity_key)
  PG_DB.exec("DELETE FROM users WHERE email = ?", "deleted@example.test")
  raise "Identity survived account deletion" if Invidious::Database::DeArrowIdentities.configured?("deleted@example.test")
end

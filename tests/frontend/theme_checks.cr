# Runs in the existing fixture harness, using its in-memory SQLite database.
def check_theme_preferences
  raise "Theme default changed" unless Preferences.from_json("{}").theme == "modern-neon"
  raise "Old YAML preferences failed" unless Preferences.from_yaml("{}\n").theme == "modern-neon"
  {"unknown", "", "../../css/default.css"}.each do |id|
    raise "Invalid JSON theme accepted" unless Preferences.from_json({theme: id}.to_json).theme == "modern-neon"
    raise "Invalid YAML theme accepted" unless Preferences.from_yaml({"theme" => id}.to_yaml).theme == "modern-neon"
  end
  prefs = Preferences.from_json(%({"theme":"fixture-theme","save_player_pos":true}))
  raise "JSON round trip failed" unless Preferences.from_json(prefs.to_json).theme == "fixture-theme"
  raise "YAML round trip failed" unless Preferences.from_yaml(prefs.to_yaml).theme == "fixture-theme"
  raise "Config rejected theme" unless ConfigPreferences.from_yaml("theme: fixture-theme").theme == "fixture-theme"
  raise "Config accepted unknown theme" unless ConfigPreferences.from_yaml("theme: unknown").theme == "modern-neon"
  original = CONFIG.default_user_preferences.theme
  begin
    CONFIG.default_user_preferences.theme = "fixture-theme"
    raise "Configured JSON default ignored" unless Preferences.from_json("{}").theme == "fixture-theme"
    raise "Configured YAML default ignored" unless Preferences.from_yaml("{}").theme == "fixture-theme"
  ensure
    CONFIG.default_user_preferences.theme = original
  end

  # Exercise the actual form handler and cookie serializer, including older forms.
  {"theme=fixture-theme", "", "theme=unknown"}.each do |body|
    env = theme_post_env(body)
    env.set "preferences", prefs
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    expected = body == "theme=unknown" ? "modern-neon" : "fixture-theme"
    raise "Anonymous form theme lost" unless saved.theme == expected
  end

  PG_DB.exec("CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, preferences TEXT)")
  PG_DB.exec("INSERT INTO users VALUES (?, ?)", "viewer@example.test", "{}")
  user = signed_in_env("/preferences").get("user").as(User)
  env = theme_post_env("theme=fixture-theme&save_player_pos=on")
  env.set "user", user
  Invidious::Routes::PreferencesRoute.update(env)
  saved = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
  raise "Account form theme lost" unless Preferences.from_json(saved).theme == "fixture-theme"

  env = theme_post_env(prefs.to_json, "application/json")
  env.set "user", user
  Invidious::Routes::API::V1::Authenticated.set_preferences(env)
  saved = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
  user.preferences = Preferences.from_json(saved)
  env.set "user", user
  raise "API theme lost" unless JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(env))["theme"] == "fixture-theme"
  # Empty supporting tables let the production exporter run without upstream calls.
  PG_DB.exec("CREATE TABLE playlists (title TEXT, id TEXT, author TEXT, description TEXT, video_count INTEGER, created TEXT, updated TEXT, privacy TEXT, \"index\" TEXT)")
  PG_DB.exec("CREATE TABLE playback_positions (email TEXT, video_id TEXT, position_seconds INTEGER, updated_at TEXT)")
  exported = Invidious::User::Export.to_invidious(user)
  raise "Exported theme lost" unless JSON.parse(exported)["preferences"]["theme"] == "fixture-theme"
  Invidious::User::Import.from_invidious(user, {preferences: JSON.parse(exported)["preferences"]}.to_json)
  saved = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
  raise "Imported theme lost" unless Preferences.from_json(saved).theme == "fixture-theme"
end

def theme_post_env(body : String, content_type = "application/x-www-form-urlencoded")
  env = HTTP::Server::Context.new(HTTP::Request.new("POST", "/preferences?referer=%2F", HTTP::Headers{"Content-Type" => content_type}, body), HTTP::Server::Response.new(IO::Memory.new))
  env.set "preferences", Preferences.from_json("{}")
  env.set "header_x-forwarded-host", "invidious.test"
  env
end

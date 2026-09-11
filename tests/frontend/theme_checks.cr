# Runs in the existing fixture harness, using its in-memory SQLite database.
def check_theme_preferences
  raise "Theme default changed" unless Preferences.from_json("{}").theme == "modern-neon"
  raise "Old YAML preferences failed" unless Preferences.from_yaml("{}\n").theme == "modern-neon"
  {"unknown", "", "../../css/default.css"}.each do |id|
    raise "Invalid JSON theme accepted" unless Preferences.from_json({theme: id}.to_json).theme == "modern-neon"
    raise "Invalid YAML theme accepted" unless Preferences.from_yaml({"theme" => id}.to_yaml).theme == "modern-neon"
  end
  diary = Preferences.from_json(%({"theme":"diary"}))
  raise "Diary JSON lost" unless Preferences.from_json(diary.to_json).theme == "diary"
  raise "Diary YAML lost" unless Preferences.from_yaml(diary.to_yaml).theme == "diary"
  env = theme_post_env("theme=diary")
  env.set "preferences", diary
  Invidious::Routes::PreferencesRoute.update(env)
  raise "Diary cookie lost" unless Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value)).theme == "diary"
  cinematic = Preferences.from_json(%({"theme":"cinematic"}))
  raise "Cinematic JSON lost" unless Preferences.from_json(cinematic.to_json).theme == "cinematic"
  raise "Cinematic YAML lost" unless Preferences.from_yaml(cinematic.to_yaml).theme == "cinematic"
  env = theme_post_env("theme=cinematic")
  env.set "preferences", cinematic
  Invidious::Routes::PreferencesRoute.update(env)
  raise "Cinematic cookie lost" unless Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value)).theme == "cinematic"
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

# Exercise production scheduling with a fixed clock and deterministic RNG.
def check_random_themes
  now = 1_800_000_000_i64
  prefs = Preferences.from_json(%({"theme":"diary","dark_mode":"dark","theme_random":true,"theme_random_interval_hours":6}))
  raise "Random default enabled" if Preferences.from_json("{}").theme_random
  initialized = Invidious::Themes.randomize(prefs, now).not_nil!
  raise "Initial theme changed" unless initialized.theme == "diary" && initialized.theme_random_next_at == now + 21600
  raise "Early randomization" if Invidious::Themes.randomize(initialized, now + 21599)
  expired = initialized
  expired.theme_random_next_at = now
  20.times do |seed|
    changed = Invidious::Themes.randomize(expired, now, random: Random.new(seed.to_u64)).not_nil!
    raise "Repeated current theme" if changed.theme == "diary"
    raise "Changed color mode" unless changed.dark_mode == "dark"
    raise "Wrong deadline" unless changed.theme_random_next_at == now + 21600
  end
  alone = [Invidious::Themes.resolve("diary")]
  raise "Single theme lost" unless Invidious::Themes.randomize(expired, now, alone).not_nil!.theme == "diary"
  raise "Catch-up schedule" unless Invidious::Themes.randomize(expired, now + 100000).not_nil!.theme_random_next_at == now + 121600
  expired.theme_random_next_at = -1
  raise "Invalid schedule changed theme" unless Invidious::Themes.randomize(expired, now).not_nil!.theme == "diary"
  expired.theme_random_next_at = Int64::MAX
  raise "Invalid future schedule" unless Invidious::Themes.randomize(expired, now).not_nil!.theme_random_next_at == now + 21600

  {0, -1, 169, 999999}.each do |hours|
    raise "Invalid interval accepted" unless Preferences.from_json({theme_random_interval_hours: hours}.to_json).theme_random_interval_hours == 6
    raise "Invalid YAML interval" unless Preferences.from_yaml("theme_random_interval_hours: #{hours}").theme_random_interval_hours == 6
  end
  raise "Non-integer interval accepted" unless Preferences.from_json(%({"theme_random_interval_hours":1.5})).theme_random_interval_hours == 6
  {1, 168}.each do |hours|
    raise "Valid interval rejected" unless Preferences.from_json({theme_random_interval_hours: hours}.to_json).theme_random_interval_hours == hours
  end
  raise "Random JSON lost" unless Preferences.from_json(initialized.to_json) == initialized
  raise "Random YAML lost" unless Preferences.from_yaml(initialized.to_yaml) == initialized
  raise "Random config lost" unless ConfigPreferences.from_yaml("theme_random: true\ntheme_random_interval_hours: 24").theme_random_interval_hours == 24

  {"theme=random" => true, "theme=cinematic" => false, "" => true}.each do |body, enabled|
    env = theme_post_env(body)
    env.set "preferences", initialized
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    raise "Random form mode lost" unless saved.theme_random == enabled
    raise "Unrelated save reset timer" if enabled && saved.theme_random_next_at != initialized.theme_random_next_at
    raise "Manual selection not saved" if !enabled && (saved.theme != "cinematic" || saved.theme_random_next_at)
  end
  env = theme_post_env("theme=random&theme_random_interval_hours=2")
  env.set "preferences", initialized
  before = Time.utc.to_unix
  Invidious::Routes::PreferencesRoute.update(env)
  saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
  raise "Interval not restarted" unless saved.theme_random_next_at.not_nil! >= before + 7200 && saved.theme == "diary"

  disabled = initialized
  disabled.theme_random = false
  env = theme_post_env("theme=random")
  env.set "preferences", disabled
  before = Time.utc.to_unix
  Invidious::Routes::PreferencesRoute.update(env)
  saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
  raise "Enabling random changed theme" unless saved.theme_random && saved.theme == disabled.theme && saved.theme_random_next_at.not_nil! >= before + 21600
  malformed = Preferences.from_json(%({"theme":"diary","theme_random_next_at":"invalid"}))
  raise "Bad schedule discarded preferences" unless malformed.theme == "diary" && malformed.theme_random_next_at.nil?

  # Account API and export/import include random settings without schema changes.
  user = signed_in_env("/preferences").get("user").as(User)
  initialized.save_player_pos = true
  env = theme_post_env(initialized.to_json, "application/json")
  env.set "user", user
  Invidious::Routes::API::V1::Authenticated.set_preferences(env)
  user.preferences = Preferences.from_json(Invidious::Database::Users.preference_json(user.email))
  raise "API random settings lost" unless user.preferences.theme_random && user.preferences.theme_random_interval_hours == 6
  env.set "user", user
  raise "API random response lost" unless JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(env))["theme_random"].as_bool
  exported = Invidious::User::Export.to_invidious(user)
  Invidious::User::Import.from_invidious(user, {preferences: JSON.parse(exported)["preferences"]}.to_json)
  raise "Imported random settings lost" unless Preferences.from_json(Invidious::Database::Users.preference_json(user.email)).theme_random

  # Real request integration persists the schedule and reuses it across devices.
  expired.theme_random_next_at = Time.utc.to_unix - 1
  PG_DB.exec("UPDATE users SET preferences = ? WHERE email = ?", expired.to_json, user.email)
  user.preferences = expired
  navigation = HTTP::Server::Context.new(HTTP::Request.new("GET", "/watch", HTTP::Headers{"Accept" => "text/html"}), HTTP::Server::Response.new(IO::Memory.new))
  navigation.set "user", user
  selected = Invidious::Themes.apply_random_theme(navigation, expired)
  raise "Account request did not randomize" if selected.theme == expired.theme
  raise "Second device changed again" unless Invidious::Themes.apply_random_theme(navigation, expired) == selected
  anonymous = HTTP::Server::Context.new(HTTP::Request.new("GET", "/watch", HTTP::Headers{"Accept" => "text/html"}), HTTP::Server::Response.new(IO::Memory.new))
  anonymous.set "header_x-forwarded-host", "invidious.test"
  selected = Invidious::Themes.apply_random_theme(anonymous, expired)
  raise "Anonymous schedule not persisted" unless Preferences.from_json(URI.decode_www_form(anonymous.response.cookies["PREFS"].value)) == selected

  # Both requests read the same account snapshot: only the first can commit.
  email = "viewer@example.test"
  PG_DB.exec("UPDATE users SET preferences = ? WHERE email = ?", initialized.to_json, email)
  snapshot = Invidious::Database::Users.preference_json(email)
  changed = initialized
  changed.theme = "cinematic"
  changed.speed = 1.5
  raise "CAS failed" unless Invidious::Database::Users.compare_and_set_preferences(email, snapshot, changed)
  raise "Stale update succeeded" if Invidious::Database::Users.compare_and_set_preferences(email, snapshot, initialized)
  raise "Concurrent change lost" unless Preferences.from_json(Invidious::Database::Users.preference_json(email)).speed == 1.5

  {"/watch", "/preferences", "/channel/abc/videos"}.each do |path|
    request = HTTP::Request.new("GET", path, HTTP::Headers{"Accept" => "text/html"})
    raise "Document excluded" unless Invidious::Themes.document_request?(request)
  end
  {"/api/v1/videos/abc", "/toggle_theme", "/videoplayback", "/themes/diary/theme.css", "/feed/channel/abc"}.each do |path|
    request = HTTP::Request.new("GET", path, HTTP::Headers{"Accept" => "text/html"})
    raise "Background request included" if Invidious::Themes.document_request?(request)
  end
  request = HTTP::Request.new("GET", "/watch", HTTP::Headers{"Accept" => "text/html", "Sec-Fetch-Dest" => "empty"})
  raise "Fetch advances theme" if Invidious::Themes.document_request?(request)

  {"", "light", "dark"}.each do |mode|
    env = HTTP::Server::Context.new(HTTP::Request.new("GET", "/toggle_theme?redirect=false&mode=#{mode}"), HTTP::Server::Response.new(IO::Memory.new))
    env.set "preferences", initialized
    env.set "header_x-forwarded-host", "invidious.test"
    Invidious::Routes::PreferencesRoute.toggle_theme(env)
    saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    raise "Explicit mode not persisted" unless saved.dark_mode == mode
  end

  original = CONFIG.default_user_preferences.dark_mode
  begin
    CONFIG.default_user_preferences.dark_mode = "dark"
    raise "System JSON overwritten" unless Preferences.from_json(%({"dark_mode":""})).dark_mode.empty?
    raise "System YAML overwritten" unless Preferences.from_yaml("dark_mode: ''").dark_mode.empty?
    raise "Missing default lost" unless Preferences.from_json("{}").dark_mode == "dark"
    raise "Legacy bool lost" unless Preferences.from_json(%({"dark_mode":false})).dark_mode == "light"
  ensure
    CONFIG.default_user_preferences.dark_mode = original
  end
  {"" => "light", "light" => "dark", "dark" => ""}.each do |mode, expected|
    env = HTTP::Server::Context.new(HTTP::Request.new("GET", "/toggle_theme?redirect=false"), HTTP::Server::Response.new(IO::Memory.new))
    current = initialized
    current.dark_mode = mode
    env.set "preferences", current
    env.set "header_x-forwarded-host", "invidious.test"
    Invidious::Routes::PreferencesRoute.toggle_theme(env)
    saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    raise "Wrong mode cycle" unless saved.dark_mode == expected && saved.theme_random && saved.theme == "diary"
  end
end

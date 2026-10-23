# Runs production preference handlers in the fixture harness's SQLite database.
def assert_retired_theme_fields_absent(raw : String)
  fields = JSON.parse(raw).as_h
  raise "Retired theme fields serialized" if Preferences::RETIRED_THEME_FIELDS.any? { |key| fields.has_key?(key) }
end

def check_appearance_preferences
  legacy = JSON.parse(%({"theme":"modern-neon","theme_random":true,"theme_random_interval_hours":6,"theme_random_next_at":1800000000})).as_h
  {"modern-neon", "diary", "random", "unknown", "../../css/default.css"}.each do |id|
    fields = legacy.merge(JSON.parse({theme: id, dark_mode: "dark", seek_seconds: 20, speed: 1.5}.to_json).as_h)
    {Preferences.from_json(fields.to_json), Preferences.from_yaml(fields.to_yaml)}.each do |prefs|
      raise "Legacy fields discarded other preferences" unless prefs.dark_mode == "dark" && prefs.seek_seconds == 20 && prefs.speed == 1.5
      assert_retired_theme_fields_absent(prefs.to_json)
      yaml = YAML.parse(prefs.to_yaml).as_h
      raise "Retired YAML fields serialized" if yaml.keys.any? { |key| Preferences::RETIRED_THEME_FIELDS.includes?(key.as_s) }
    end
    configured = ConfigPreferences.from_yaml(fields.to_yaml)
    raise "Legacy config discarded color mode" unless configured.dark_mode == "dark"
    raise "Retired config fields serialized" if YAML.parse(configured.to_yaml).as_h.keys.any? { |key| Preferences::RETIRED_THEME_FIELDS.includes?(key.as_s) }
    env = preferences_post_env("theme=#{id}&theme_random_interval_hours=12&dark_mode=dark")
    Invidious::Routes::PreferencesRoute.update(env)
    cookie = URI.decode_www_form(env.response.cookies["PREFS"].value)
    assert_retired_theme_fields_absent(cookie)
    raise "Legacy form discarded color mode" unless Preferences.from_json(cookie).dark_mode == "dark"
  end
  malformed = %({"theme":{},"theme_random":null,"theme_random_interval_hours":"invalid","theme_random_next_at":[],"dark_mode":"light"})
  raise "Obsolete values rejected JSON preferences" unless Preferences.from_json(malformed).dark_mode == "light"
  raise "Obsolete values rejected YAML preferences" unless Preferences.from_yaml(JSON.parse(malformed).as_h.to_yaml).dark_mode == "light"
  stored = legacy.merge(JSON.parse(%({"future":{"keep":true},"dark_mode":"dark"})).as_h)
  Preferences.remove_retired_theme_fields(stored)
  assert_retired_theme_fields_absent(stored.to_json)
  raise "Retirement erased unrelated fields" unless stored["future"]["keep"].as_bool && stored["dark_mode"] == "dark"
  prefs = Preferences.from_json(%({"dark_mode":"dark","save_player_pos":true}))
  PG_DB.exec("CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, preferences TEXT)")
  PG_DB.exec("INSERT INTO users VALUES (?, ?)", "viewer@example.test", "{}")
  user = signed_in_env("/preferences").get("user").as(User)
  env = preferences_post_env("dark_mode=dark&save_player_pos=on")
  env.set "user", user
  Invidious::Routes::PreferencesRoute.update(env)
  saved = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
  assert_retired_theme_fields_absent(saved)
  raise "Account form color mode lost" unless Preferences.from_json(saved).dark_mode == "dark"
  chat_env = HTTP::Server::Context.new(HTTP::Request.new("PATCH", "/api/v1/auth/chat_preferences",
    HTTP::Headers{"Content-Type" => "application/json"},
    {chat_show_timestamps: false, chat_font_scale: 125, chat_width_px: 520,
     chat_overlay_mode: true, chat_overlay_opacity: 0,
     chat_overlay_x: 500, chat_overlay_y: 100, chat_overlay_width: 400, chat_overlay_height: 700,
     chat_user_blacklist: "UCblocked", chat_word_blacklist: "/spam/"}.to_json), HTTP::Server::Response.new(IO::Memory.new))
  chat_env.set "user", user
  Invidious::Routes::API::V1::Authenticated.set_chat_preferences(chat_env)
  chat_prefs = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
  raise "Account chat settings lost" unless !chat_prefs.chat_show_timestamps && chat_prefs.chat_font_scale == 125 &&
                                            chat_prefs.chat_width_px == 520 && chat_prefs.chat_user_blacklist == "UCblocked" &&
                                            chat_prefs.chat_word_blacklist == "/spam/" && chat_prefs.dark_mode == "dark" &&
                                            chat_prefs.chat_overlay_mode && chat_prefs.chat_overlay_opacity == 0 &&
                                            chat_prefs.chat_overlay_x == 500 && chat_prefs.chat_overlay_y == 100 &&
                                            chat_prefs.chat_overlay_width == 400 && chat_prefs.chat_overlay_height == 700
  partial_chat_env = HTTP::Server::Context.new(HTTP::Request.new("PATCH", "/api/v1/auth/chat_preferences",
    HTTP::Headers{"Content-Type" => "application/json"}, {chat_show_timestamps: true}.to_json), HTTP::Server::Response.new(IO::Memory.new))
  partial_chat_env.set "user", user
  Invidious::Routes::API::V1::Authenticated.set_chat_preferences(partial_chat_env)
  chat_prefs = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
  raise "Partial chat settings erased existing values" unless chat_prefs.chat_show_timestamps && chat_prefs.chat_width_px == 520 && chat_prefs.chat_word_blacklist == "/spam/" &&
                                                              chat_prefs.chat_overlay_mode && chat_prefs.chat_overlay_opacity == 0 && chat_prefs.chat_overlay_x == 500
  invalid_overlay_env = HTTP::Server::Context.new(HTTP::Request.new("PATCH", "/api/v1/auth/chat_preferences",
    HTTP::Headers{"Content-Type" => "application/json"}, {chat_overlay_x: 800}.to_json), HTTP::Server::Response.new(IO::Memory.new))
  invalid_overlay_env.set "user", user
  Invidious::Routes::API::V1::Authenticated.set_chat_preferences(invalid_overlay_env)
  raise "Invalid overlay rectangle accepted" unless invalid_overlay_env.response.status_code == 400
  env = preferences_post_env("dark_mode=dark&save_player_pos=on")
  env.set "preferences", chat_prefs
  env.set "user", user
  Invidious::Routes::PreferencesRoute.update(env)
  preserved_chat = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
  raise "Preferences form erased chat settings" unless preserved_chat.chat_width_px == 520 && preserved_chat.chat_overlay_mode &&
                                                       preserved_chat.chat_overlay_opacity == 0 && preserved_chat.chat_overlay_x == 500

  env = preferences_post_env(JSON.parse(prefs.to_json).as_h.merge(legacy).to_json, "application/json")
  env.set "user", user
  Invidious::Routes::API::V1::Authenticated.set_preferences(env)
  saved = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
  assert_retired_theme_fields_absent(saved)
  user.preferences = Preferences.from_json(saved)
  env.set "user", user
  raise "API color mode lost" unless JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(env))["dark_mode"] == "dark"
  # Empty supporting tables let the production exporter run without upstream calls.
  PG_DB.exec("CREATE TABLE playlists (title TEXT, id TEXT, author TEXT, description TEXT, video_count INTEGER, created TEXT, updated TEXT, privacy TEXT, \"index\" TEXT)")
  PG_DB.exec("CREATE TABLE playback_positions (email TEXT, video_id TEXT, position_seconds INTEGER, updated_at TEXT)")
  PG_DB.exec("CREATE TABLE chat_timing_offsets (email TEXT, video_id TEXT, offset_ms INTEGER, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (email, video_id))")
  timing_env = HTTP::Server::Context.new(HTTP::Request.new("PUT", "/api/v1/auth/chat_timing/2isYuQZMbdU",
    HTTP::Headers{"Content-Type" => "application/json"}, {offsetMs: -1_000}.to_json), HTTP::Server::Response.new(IO::Memory.new))
  timing_env.params.url["id"] = "2isYuQZMbdU"
  timing_env.set "user", user
  raise "Account timing endpoint response lost" unless JSON.parse(Invidious::Routes::API::V1::Authenticated.set_chat_timing(timing_env))["offsetMs"].as_i == -1_000
  raise "Account chat timing lost" unless Invidious::Database::ChatTimingOffsets.select(user.email, "2isYuQZMbdU") == -1_000
  get_timing_env = HTTP::Server::Context.new(HTTP::Request.new("GET", "/api/v1/auth/chat_timing/2isYuQZMbdU"), HTTP::Server::Response.new(IO::Memory.new))
  get_timing_env.params.url["id"] = "2isYuQZMbdU"
  get_timing_env.set "user", user
  raise "Account timing endpoint read lost" unless JSON.parse(Invidious::Routes::API::V1::Authenticated.get_chat_timing(get_timing_env))["offsetMs"].as_i == -1_000
  exported = Invidious::User::Export.to_invidious(user)
  assert_retired_theme_fields_absent(JSON.parse(exported)["preferences"].to_json)
  raise "Exported color mode lost" unless JSON.parse(exported)["preferences"]["dark_mode"] == "dark"
  raise "Exported chat timing lost" unless JSON.parse(exported)["chat_timing_offsets"].as_a.first["offset_ms"].as_i == -1_000
  Invidious::Database::ChatTimingOffsets.upsert(user.email, "2isYuQZMbdU", 0)
  Invidious::User::Import.from_invidious(user, {chat_timing_offsets: JSON.parse(exported)["chat_timing_offsets"]}.to_json)
  raise "Imported chat timing lost" unless Invidious::Database::ChatTimingOffsets.select(user.email, "2isYuQZMbdU") == -1_000
  Invidious::User::Import.from_invidious(user, {preferences: JSON.parse(exported)["preferences"].as_h.merge(legacy)}.to_json)
  saved = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
  assert_retired_theme_fields_absent(saved)
  raise "Imported color mode lost" unless Preferences.from_json(saved).dark_mode == "dark"
end

def preferences_post_env(body : String, content_type = "application/x-www-form-urlencoded")
  env = HTTP::Server::Context.new(HTTP::Request.new("POST", "/preferences?referer=%2F", HTTP::Headers{"Content-Type" => content_type}, body), HTTP::Server::Response.new(IO::Memory.new))
  env.set "preferences", Preferences.from_json("{}")
  env.set "header_x-forwarded-host", "invidious.test"
  env.set "sid", "fixture-session"
  env.request.headers["X-CSRF-Token"] = generate_response("fixture-session", {"POST:preferences"}, HMAC_KEY)
  env
end

def check_color_modes
  prefs = Preferences.from_json(%({"dark_mode":"dark","save_player_pos":true}))
  email = "viewer@example.test"
  PG_DB.exec("UPDATE users SET preferences = ? WHERE email = ?", prefs.to_json, email)
  snapshot = Invidious::Database::Users.preference_json(email)
  changed = prefs
  changed.speed = 1.5
  raise "CAS failed" unless Invidious::Database::Users.compare_and_set_preferences(email, snapshot, changed)
  raise "Stale update succeeded" if Invidious::Database::Users.compare_and_set_preferences(email, snapshot, prefs)
  raise "Concurrent change lost" unless Preferences.from_json(Invidious::Database::Users.preference_json(email)).speed == 1.5

  {"", "light", "dark"}.each do |mode|
    env = HTTP::Server::Context.new(HTTP::Request.new("POST", "/toggle_theme?redirect=false&mode=#{mode}"), HTTP::Server::Response.new(IO::Memory.new))
    env.set "preferences", prefs
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
    env = HTTP::Server::Context.new(HTTP::Request.new("POST", "/toggle_theme?redirect=false"), HTTP::Server::Response.new(IO::Memory.new))
    current = prefs
    current.dark_mode = mode
    env.set "preferences", current
    env.set "header_x-forwarded-host", "invidious.test"
    Invidious::Routes::PreferencesRoute.toggle_theme(env)
    saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    raise "Wrong mode cycle" unless saved.dark_mode == expected
  end
end

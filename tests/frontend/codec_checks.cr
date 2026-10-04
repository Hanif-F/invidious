# Preference persistence and video-parameter resolution through production code.
def check_codec_preferences
  raise "Codec JSON default changed" unless Preferences.from_json("{}").video_codec == "auto"
  raise "Codec YAML default changed" unless Preferences.from_yaml("{}").video_codec == "auto"
  raise "Codec config default changed" unless ConfigPreferences.from_yaml("{}").video_codec == "auto"
  {"vp9", "", "AV1"}.each do |value|
    raise "Invalid JSON codec accepted" unless Preferences.from_json({video_codec: value}.to_json).video_codec == "auto"
    raise "Invalid YAML codec accepted" unless Preferences.from_yaml({"video_codec" => value}.to_yaml).video_codec == "auto"
    raise "Invalid config codec accepted" unless ConfigPreferences.from_yaml({"video_codec" => value}.to_yaml).video_codec == "auto"
  end
  {"null", "true", "123", "{}"}.each do |value|
    raise "Invalid codec type accepted" unless Preferences.from_json(%({"video_codec":#{value}})).video_codec == "auto"
  end
  original = CONFIG.default_user_preferences.video_codec
  begin
    CONFIG.default_user_preferences.video_codec = "av1"
    raise "Configured codec default lost" unless Preferences.from_json("{}").video_codec == "av1" && Preferences.from_yaml("{}").video_codec == "av1"
    raise "Configured video codec lost" unless Invidious::Videos.process_video_params(URI::Params.new, nil).video_codec == "av1"
  ensure
    CONFIG.default_user_preferences.video_codec = original
  end

  {"auto", "av1", "h264"}.each do |codec|
    prefs = Preferences.from_json({video_codec: codec}.to_json)
    raise "Codec JSON roundtrip lost" unless Preferences.from_json(prefs.to_json).video_codec == codec
    raise "Codec YAML roundtrip lost" unless Preferences.from_yaml(prefs.to_yaml).video_codec == codec
    raise "Configured codec rejected" unless ConfigPreferences.from_yaml({"video_codec" => codec}.to_yaml).video_codec == codec
    raise "Saved video codec lost" unless Invidious::Videos.process_video_params(URI::Params.new, prefs).video_codec == codec
    raise "Codec override lost" unless Invidious::Videos.process_video_params(URI::Params.parse("video_codec=h264"), prefs).video_codec == "h264"
    raise "Explicit Auto override lost" unless Invidious::Videos.process_video_params(URI::Params.parse("video_codec=auto"), prefs).video_codec == "auto"
    raise "Invalid codec override accepted" unless Invidious::Videos.process_video_params(URI::Params.parse("video_codec=invalid"), prefs).video_codec == "auto"

    env = theme_post_env("video_codec=#{codec}")
    Invidious::Routes::PreferencesRoute.update(env)
    raise "Guest codec lost" unless Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value)).video_codec == codec
    env = theme_post_env("")
    env.set "preferences", prefs
    Invidious::Routes::PreferencesRoute.update(env)
    raise "Older form erased codec" unless Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value)).video_codec == codec

    user = signed_in_env("/preferences").get("user").as(User)
    env = theme_post_env("video_codec=#{codec}")
    env.set "user", user
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Account codec lost" unless saved.video_codec == codec
    env = theme_post_env(prefs.to_json, "application/json")
    env.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(env)
    saved = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "API codec lost" unless saved.video_codec == codec
    user.preferences = saved
    env.set "user", user
    raise "GET API codec lost" unless JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(env))["video_codec"].as_s == codec
    exported = JSON.parse(Invidious::User::Export.to_invidious(user))
    raise "Exported codec lost" unless exported["preferences"]["video_codec"].as_s == codec
    Invidious::User::Import.from_invidious(user, {preferences: exported["preferences"]}.to_json)
    raise "Imported codec lost" unless Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)).video_codec == codec
  end
  puts "Codec preference persistence and URL/default resolution checks passed"
end

def check_sponsorblock_preferences
  invalid_id = fixture_env("/api/v1/sponsorblock/invalid")
  invalid_id.params.url["id"] = "invalid"
  Invidious::Routes::API::V1::SponsorBlock.segments(invalid_id)
  raise "Invalid ID accepted" unless invalid_id.response.status_code == 400
  defaults = Preferences.from_json("{}")
  raise "SponsorBlock must be opt-in" if defaults.sponsorblock_enabled
  raise "Default mode" unless defaults.sponsorblock_modes.values.all? { |mode| mode == "manual" }
  raise "Old YAML" if Preferences.from_yaml("{}").sponsorblock_enabled
  config = ConfigPreferences.from_yaml("sponsorblock_modes:\n  sponsor: auto\nsponsorblock_colors:\n  sponsor: invalid\n")
  raise "Config mode" unless config.sponsorblock_modes["sponsor"] == "auto"
  raise "Config color" unless config.sponsorblock_colors["sponsor"] == "#4caf50"
  invalid = Preferences.from_json(%({"sponsorblock_modes":{"sponsor":"wrong"},"sponsorblock_colors":{"sponsor":12}}))
  raise "Invalid mode" unless invalid.sponsorblock_modes["sponsor"] == "manual"
  raise "Invalid color" unless invalid.sponsorblock_colors["sponsor"] == "#4caf50"
  {true, false}.each do |enabled|
    body = "sponsorblock_mode_sponsor=auto&sponsorblock_mode_filler=disabled&sponsorblock_color_sponsor=%23123456"
    body += "&sponsorblock_enabled=on" if enabled
    env = theme_post_env(body)
    Invidious::Routes::PreferencesRoute.update(env)
    prefs = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    raise "Guest toggle" unless prefs.sponsorblock_enabled == enabled
    raise "Guest mode" unless prefs.sponsorblock_modes["sponsor"] == "auto" && prefs.sponsorblock_modes["filler"] == "disabled"
    raise "Guest color" unless prefs.sponsorblock_colors["sponsor"] == "#123456"
    raise "YAML roundtrip" unless Preferences.from_yaml(prefs.to_yaml).sponsorblock_modes == prefs.sponsorblock_modes
    user = signed_in_env("/preferences").get("user").as(User)
    env = theme_post_env(body)
    env.set "user", user
    Invidious::Routes::PreferencesRoute.update(env)
    stored = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Account preference" unless stored.sponsorblock_enabled == enabled && stored.sponsorblock_colors == prefs.sponsorblock_colors && stored.sponsorblock_modes == prefs.sponsorblock_modes
    api = theme_post_env(prefs.to_json, "application/json")
    api.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(api)
    stored = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "API preferences" unless stored.sponsorblock_modes == prefs.sponsorblock_modes
    user.preferences = stored
    exported = Invidious::User::Export.to_invidious(user)
    Invidious::User::Import.from_invidious(user, {preferences: JSON.parse(exported)["preferences"]}.to_json)
    raise "Export/import" unless user.preferences.sponsorblock_modes == stored.sponsorblock_modes && user.preferences.sponsorblock_colors == stored.sponsorblock_colors
  end
end

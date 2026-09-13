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

def check_sponsorblock_channels
  id = "UC" + "a" * 22
  prefs = Preferences.from_json({sponsorblock_channel_overrides: {id => {name: "<Channel>", enabled: false, modes: {sponsor: "auto"}}}}.to_json)
  raise "JSON roundtrip" unless Preferences.from_json(prefs.to_json).sponsorblock_channel_overrides[id].enabled == false
  raise "YAML roundtrip" unless Preferences.from_yaml(prefs.to_yaml).sponsorblock_channel_overrides[id].modes["sponsor"] == "auto"
  user = signed_in_env("/").get("user").as(User)
  user.preferences = prefs
  env = theme_post_env("sponsorblock_enabled=on")
  env.set "preferences", prefs
  env.set "user", user
  Invidious::Routes::PreferencesRoute.update(env)
  raise "Global form lost overrides" unless user.preferences.sponsorblock_channel_overrides.has_key?(id)
  exported = Invidious::User::Export.to_invidious(user)
  Invidious::User::Import.from_invidious(user, {preferences: JSON.parse(exported)["preferences"]}.to_json)
  raise "Import lost overrides" unless user.preferences.sponsorblock_channel_overrides[id].enabled == false
  path = Invidious::Routes::SponsorBlockPreferences::PATH
  guest = fixture_env(path)
  html = Invidious::Routes::SponsorBlockPreferences.show(guest)
  raise "Guest sign-in missing" unless html.includes?("Sign in to save")
  page = signed_in_env("#{path}?channel=#{id}")
  page.set "preferences", prefs
  page.set "sid", "fixture-session"
  html = Invidious::Routes::SponsorBlockPreferences.show(page)
  raise "Channel editor missing" unless html.includes?("name=\"mode_sponsor\"") && html.includes?("&lt;Channel&gt;")
  File.write("tests/frontend/.generated/sponsorblock-channels.html", html)
  token = generate_response("fixture-session", {"POST:preferences/sponsorblock/channels"}, HMAC_KEY)
  # Effective settings are resolved by the shared watch/embed player template.
  video_id = fixture_video.ucid
  {false, true}.each do |embed|
    playback = signed_in_env("/watch?v=2isYuQZMbdU")
    settings = playback.get("preferences").as(Preferences)
    settings.sponsorblock_channel_overrides[video_id] = Invidious::SponsorBlock::ChannelOverride.new("Studio", true, {"sponsor" => "auto"})
    playback.set "preferences", settings
    output = watch_fixture(playback, embed: embed, account: true)
    config = JSON.parse(output.match(/<script id="player_data" type="application\/json">(.*?)<\/script>/m).not_nil![1])["sponsorblock"]
    raise "Player override missing" unless config["enabled"].as_bool && config["modes"]["sponsor"].as_s == "auto"
  end
  invalid = signed_in_env("#{path}?channel=invalid")
  invalid.set "sid", "fixture-session"
  Invidious::Routes::SponsorBlockPreferences.show(invalid)
  raise "Invalid ID accepted" unless invalid.response.status_code == 400
  lookup = signed_in_env("#{path}?channel=#{id}")
  lookup.set "sid", "fixture-session"
  Invidious::Routes::SponsorBlockPreferences.show(lookup)
  raise "Lookup failure not reported" unless lookup.response.status_code == 502
  # The fixture DB has no channels table, so lookup fails locally without network access.
  {"enabled=true&mode_sponsor=marker", "enabled=inherit&mode_sponsor=inherit"}.each do |fields|
    body = "channel=#{id}&action=save&#{fields}&csrf_token=#{URI.encode_www_form(token)}"
    post = HTTP::Server::Context.new(HTTP::Request.new("POST", path, HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded"}, body), HTTP::Server::Response.new(IO::Memory.new))
    post.set "user", user
    post.set "preferences", user.preferences
    post.set "sid", "fixture-session"
    Invidious::Routes::SponsorBlockPreferences.update(post)
    raise "Save failed" unless post.response.status_code == 302
    if fields.starts_with?("enabled=true")
      raise "Override not saved" unless user.preferences.sponsorblock_channel_overrides[id].modes["sponsor"] == "marker"
    else
      raise "Inheritance did not reset" unless user.preferences.sponsorblock_channel_overrides.empty?
    end
  end
  user.preferences.sponsorblock_channel_overrides[id] = Invidious::SponsorBlock::ChannelOverride.new("Channel", false, {} of String => String)
  {false, true}.each do |valid|
    body = "channel=#{id}&action=reset"
    body += "&csrf_token=#{URI.encode_www_form(token)}" if valid
    post = HTTP::Server::Context.new(HTTP::Request.new("POST", path, HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded"}, body), HTTP::Server::Response.new(IO::Memory.new))
    post.set "user", user
    post.set "preferences", user.preferences
    post.set "sid", "fixture-session"
    Invidious::Routes::SponsorBlockPreferences.update(post)
    raise "CSRF or reset failure" unless valid ? user.preferences.sponsorblock_channel_overrides.empty? : post.response.status_code == 403
  end
end

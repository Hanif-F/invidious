# Exercise the production form, cookie, account API and backup paths together.
def check_seek_preferences
  raise "Seek JSON default" unless Preferences.from_json("{}").seek_seconds == 10
  raise "Seek YAML default" unless Preferences.from_yaml("{}").seek_seconds == 10
  raise "Seek config default" unless ConfigPreferences.from_yaml("{}").seek_seconds == 10
  {"0", "15", "-5", "5.5", "null", "true", %q("20"), "[]", "{}"}.each do |raw|
    raise "Invalid saved seek value #{raw}" unless Preferences.from_json(%({"seek_seconds":#{raw}})).seek_seconds == 10
  end
  {0, 15, -5, 5.0, "20", nil, true, [] of Int32, {} of String => Int32}.each do |invalid|
    raise "Invalid YAML seek interval" unless Preferences.from_yaml({seek_seconds: invalid}.to_yaml).seek_seconds == 10
    raise "Invalid configured seek interval" unless ConfigPreferences.from_yaml({seek_seconds: invalid}.to_yaml).seek_seconds == 10
  end
  Invidious::Videos::SeekPreferences::CHOICES.each do |seconds|
    prefs = Preferences.from_json({seek_seconds: seconds}.to_json)
    raise "Seek JSON roundtrip" unless Preferences.from_json(prefs.to_json).seek_seconds == seconds
    raise "Seek YAML roundtrip" unless Preferences.from_yaml(prefs.to_yaml).seek_seconds == seconds
    raise "Seek config roundtrip" unless ConfigPreferences.from_yaml({seek_seconds: seconds}.to_yaml).seek_seconds == seconds

    env = theme_post_env("seek_seconds=#{seconds}")
    Invidious::Routes::PreferencesRoute.update(env)
    cookie = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    raise "Guest seek save" unless cookie.seek_seconds == seconds
    env = theme_post_env("")
    env.set "preferences", cookie
    Invidious::Routes::PreferencesRoute.update(env)
    raise "Older form erased seek interval" unless Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value)).seek_seconds == seconds

    user = signed_in_env("/preferences").get("user").as(User)
    env = theme_post_env("seek_seconds=#{seconds}")
    env.set "user", user
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Account form seek save" unless saved.seek_seconds == seconds
    # A native PATCH's validated JSON is merged with the same stored account JSON.
    patch = JSON.parse({seek_seconds: seconds, speed: 2}.to_json).as_h
    Invidious::NativePreferences.validate_patch(patch)
    stored = JSON.parse(saved.to_json).as_h
    Invidious::SponsorBlock.merge_patch(stored, patch, {} of String => String)
    env = theme_post_env(stored.to_json, "application/json")
    env.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(env)
    user.preferences = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    env.set "user", user
    raise "Account API seek roundtrip" unless JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(env))["seek_seconds"].as_i == seconds
    exported = JSON.parse(Invidious::User::Export.to_invidious(user))
    raise "Export seek interval" unless exported["preferences"]["seek_seconds"].as_i == seconds
    Invidious::User::Import.from_invidious(user, {preferences: exported["preferences"]}.to_json)
    raise "Import seek interval" unless Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)).seek_seconds == seconds
    raise "Account save altered guest" unless cookie.seek_seconds == seconds

    {false, true}.each do |embed|
      env = fixture_env(embed ? "/embed/2isYuQZMbdU" : "/watch?v=2isYuQZMbdU")
      env.set "preferences", prefs
      html = watch_fixture(env, nil, embed: embed)
      data = XML.parse_html(html).xpath_node("//script[@id='player_data']").not_nil!.content
      raise "Player seek configuration" unless JSON.parse(data)["seek_seconds"].as_i == seconds
    end
  end
  puts "Seek interval cookie/account/API/JSON/YAML/backup/player checks passed"
end

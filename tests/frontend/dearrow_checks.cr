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

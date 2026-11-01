# Render the production default route, including historical bookmark destinations.
def write_settings_entry_fixtures(output)
  previous = Invidious::Database::Users.preference_json("viewer@example.test")
  {"light", "dark"}.each do |mode|
    {false, true}.each do |account|
      env = account ? signed_in_env("/preferences?referer=%2Fwatch") : fixture_env("/preferences?referer=%2Fwatch", mode)
      prefs = env.get("preferences").as(Preferences)
      prefs.dark_mode = mode
      seed_saved_preferences(env, prefs)
      html = Invidious::Routes::PreferencesRoute.show(env).as(String)
      raise "Default Settings still rendered the legacy full form" if html.includes?("preferences-form") || !html.includes?("data-settings-legacy-entry") || !html.includes?("data-category-form")
      raise "Default Settings lost no-store" unless env.response.headers["Cache-Control"] == "private, no-store"
      File.write("#{output}/d6-settings-entry-#{account ? "account" : "guest"}-#{mode}.html", html)
    end
  end
  {"appearance" => "layout", "playback" => "player"}.each do |section, retired|
    env = signed_in_env("/preferences?section=#{section}&retired=#{retired}")
    File.write("#{output}/d6-settings-retired-#{retired}.html", Invidious::Routes::PreferencesRoute.show(env).as(String))
  end
ensure
  PG_DB.exec("UPDATE users SET preferences = ? WHERE email = ?", previous, "viewer@example.test") if previous
end

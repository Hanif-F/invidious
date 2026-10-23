def check_qol_preferences
  identity = Preferences.from_json("{}")
  original = Invidious::Frontend::Misc.browse_fingerprint(identity)
  identity.dark_mode = "light"
  identity.speed = 1.5
  identity.timezone = "Asia/Jakarta"
  raise "Automatic/player appearance changes invalidate browsing" unless Invidious::Frontend::Misc.browse_fingerprint(identity) == original
  identity.show_member_videos = !identity.show_member_videos
  raise "Visibility changes preserve stale browsing" if Invidious::Frontend::Misc.browse_fingerprint(identity) == original
  {false, true}.each do |account|
    env = preferences_post_env("dark_mode=light&ui_density=compact&show_original_title_present=1&show_original_title=on")
    env.request.query = "redirect=false"
    env.set "user", signed_in_env("/preferences").get("user").as(User) if account
    result = JSON.parse(Invidious::Routes::PreferencesRoute.update(env).as(String))
    raise "Missing canonical preferences" unless result["preferences"]["dark_mode"] == "light" && result["preferences"]["ui_density"] == "compact"
    raise "Missing preference identity" unless result["fingerprint"].as_s.size == 64
    raise "AJAX preferences redirected" if env.response.headers.has_key?("Location")
    raise "Private preferences cached" unless env.response.headers["Cache-Control"] == "private, no-store"
    if account
      raw = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", env.get("user").as(User).email, as: String)
      raise "Account persistence differed" unless JSON.parse(raw) == result["preferences"]
    else
      raise "Guest persistence differed" unless JSON.parse(URI.decode_www_form(env.response.cookies["PREFS"].value)) == result["preferences"]
    end
  end
  rejected = preferences_post_env("dark_mode=light")
  rejected.request.query = "redirect=false"
  rejected.request.headers.delete("X-CSRF-Token")
  rejected.set "user", signed_in_env("/preferences").get("user").as(User)
  Invidious::Routes::PreferencesRoute.update(rejected)
  raise "AJAX preferences bypassed CSRF" unless rejected.response.status_code == 403
  puts "QoL canonical guest/account preference saves and CSRF checks passed"
end

# D7 production handlers render account forms without a running app or upstream.
def account_surface_env(path, mode, locale = "en-US")
  env = signed_in_env(path)
  preferences = env.get("preferences").as(Preferences)
  preferences.dark_mode = mode
  preferences.locale = locale
  env.set "preferences", preferences
  user = env.get("user").as(User)
  user.preferences = preferences
  user.username = "StudioObserver"
  env.set "user", user
  env
end

def account_sessions_fixture(mode, locale = "en-US", empty = false)
  env = account_surface_env("/token_manager", mode, locale)
  navbar_search = true
  sid = env.get("sid").as(String)
  tokens = empty ? [] of NamedTuple(session: String, issued: Time) : [
    {session: sid, issued: Time.utc(2026, 10, 28, 10, 30)},
    {session: "v1:synthetic-private-api-session", issued: Time.utc(2026, 10, 27, 9, 15)},
    {session: "synthetic-private-other-browser", issued: Time.utc(2026, 10, 25, 14, 45)},
  ]
  render "src/invidious/views/user/token_manager.ecr", "src/invidious/views/template.ecr"
end

def issued_token_fixture(mode, locale = "en-US")
  env = account_surface_env("/authorize_token", mode, locale)
  navbar_search = true
  env.set "access_token", %({"session":"synthetic-private-token","scopes":["GET:subscriptions", "<script>window.injected=true</script>"]})
  callback_url = nil.as(URI?)
  expire = nil.as(Int32?)
  scopes = [] of String
  csrf_token = ""
  render "src/invidious/views/user/authorize_token.ecr", "src/invidious/views/template.ecr"
end

def write_account_surface_fixtures(output)
  old_login, old_registration = CONFIG.login_enabled, CONFIG.registration_enabled
  old_captcha = CONFIG.captcha_enabled
  CONFIG.captcha_enabled = false
  PG_DB.exec("CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, expire TEXT)")
  CONFIG.login_enabled = CONFIG.registration_enabled = true
  {"light", "dark", "rtl"}.each do |variant|
    mode = variant == "rtl" ? "dark" : variant
    locale = variant == "rtl" ? "ar" : "en-US"
    account = account_surface_env("/account", mode, locale)
    File.write("#{output}/d7-account-#{variant}.html", Invidious::Routes::Account.get_account(account).as(String))
    File.write("#{output}/d7-account-failed-#{variant}.html", Invidious::Routes::Account.get_account(account, "Username is already taken.", %(<unavailable>" draft)).as(String))
    File.write("#{output}/d7-sessions-#{variant}.html", account_sessions_fixture(mode, locale))
    File.write("#{output}/d7-sessions-empty-#{variant}.html", account_sessions_fixture(mode, locale, true))
    File.write("#{output}/d7-token-issued-#{variant}.html", issued_token_fixture(mode, locale))
    deletion = account_surface_env("/delete_account?referer=%2Faccount", mode, locale)
    File.write("#{output}/d7-delete-#{variant}.html", Invidious::Routes::Account.get_delete(deletion).as(String))
    File.write("#{output}/d7-delete-failed-#{variant}.html", Invidious::Routes::Account.get_delete(deletion, "Incorrect password").as(String))
    callback = %(tividious://authorize/path?client="quoted"&label=<safe>)
    scope = %(GET:subscriptions," autofocus onfocus="window.injected=true)
    authorization = account_surface_env("/authorize_token?#{URI::Params.encode({"callback_url" => callback, "scopes" => scope, "expire" => "2000000000"})}", mode, locale)
    File.write("#{output}/d7-authorize-#{variant}.html", Invidious::Routes::Account.get_authorize_token(authorization).as(String))
    wide = account_surface_env("/authorize_token?expire=9223372036854775807", mode, locale)
    File.write("#{output}/d7-authorize-wide-#{variant}.html", Invidious::Routes::Account.get_authorize_token(wide).as(String))
    blank = account_surface_env("/authorize_token", mode, locale)
    File.write("#{output}/d7-authorize-empty-#{variant}.html", Invidious::Routes::Account.get_authorize_token(blank).as(String))
    tv = account_surface_env("/tv?user_code=ABCD2345", mode, locale)
    File.write("#{output}/d7-tv-#{variant}.html", Invidious::Routes::TvPairing.show(tv).as(String))
    File.write("#{output}/d7-tv-failed-#{variant}.html", Invidious::Routes::TvPairing.show(tv, "This code or form is invalid, expired, or already used. Start again on your TV.").as(String))
    File.write("#{output}/d7-tv-approved-#{variant}.html", Invidious::Routes::TvPairing.show(tv, "TV access approved. Return to your TV to finish signing in.", true).as(String))
    {false, true}.each do |signup|
      env = fixture_env(signup ? "/signup?referer=%2Faccount" : "/login?referer=%2Faccount", mode, locale: locale)
      type = signup ? "signup" : "login"
      File.write("#{output}/d7-#{type}-#{variant}.html", Invidious::Routes::Login.render_form(env, signup).as(String))
      File.write("#{output}/d7-#{type}-failed-#{variant}.html", Invidious::Routes::Login.render_form(env, signup, "Invalid form. Please try again.", %(<escaped>" user)).as(String))
    end
    CONFIG.captcha_enabled = true
    captcha_env = fixture_env("/signup", mode, locale: locale)
    File.write("#{output}/d7-signup-captcha-#{variant}.html", Invidious::Routes::Login.render_form(captcha_env, true).as(String))
    CONFIG.captcha_enabled = false
  end
ensure
  CONFIG.captcha_enabled = old_captcha unless old_captcha.nil?
  CONFIG.login_enabled = old_login unless old_login.nil?
  CONFIG.registration_enabled = old_registration unless old_registration.nil?
end

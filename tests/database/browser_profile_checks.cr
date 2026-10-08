# Loaded by the guarded account harness; requests use production middleware.
def check_browser_profiles
  profiles = Invidious::BrowserProfiles
  password = "separate browser profiles test password"
  accounts = Invidious::Database::Accounts
  registration = CONFIG.registration_enabled
  CONFIG.registration_enabled = true
  alice_sid = accounts.register("ProfileAlice", password, Preferences.from_json(%({"theme":"diary","speed":1.5})))
  bob_sid = accounts.register("ProfileBob", password, Preferences.from_json("{}"))
  alice_email = Invidious::Database::SessionIDs.select_email(alice_sid).not_nil!
  bob_email = Invidious::Database::SessionIDs.select_email(bob_sid).not_nil!
  alice = profiles.account_scope(alice_email)
  bob = profiles.account_scope(bob_email)
  check(alice.matches?(/\A[0-9a-f]{64}\z/) && alice != bob, "Browser profiles expose account identities or collide")
  guest_prefs = URI.encode_www_form(%({"theme":"modern-neon","speed":0.75}))
  cookie_header = "PREFS=#{guest_prefs}; SEARCH_SHOW_MEMBER_VIDEOS=1; SEARCH_INCLUDE_BLOCKED_#{bob}=1"
  env = context("GET", "/preferences", cookies: "SID=#{alice_sid}; #{cookie_header}")
  Invidious::Routes::BeforeAll.handle(env)
  check(env.get("browser_profile").as(String) == alice && env.get("preferences").as(Preferences).speed == 1.5, "Guest preferences overrode account data")
  check(!Invidious::Frontend::SearchPreferences.apply(env, HTTP::Params.new, false), "Account inherited guest search settings")
  check(Invidious::Frontend::SubscriptionManager.preference(env) == "alphabetical", "Account did not start with default sorting")
  check(env.response.cookies[Invidious::BrowserProfiles::MARKER].value == alice, "Server did not publish browser profile")
  check(env.response.headers["X-Invidious-Browser-Profile"] == alice, "Browser response omitted profile header")

  # Signing in preserves the guest cookie and does not copy it into the account.
  login = context("GET", "/login", cookies: cookie_header)
  Invidious::Authentication.set_session(login, alice_sid)
  check(login.response.cookies["PREFS"]?.nil? && login.response.cookies[Invidious::BrowserProfiles::MARKER].value == alice, "Login destroyed guest settings")
  check(Invidious::Database::Users.select!(email: alice_email).preferences.speed == 1.5, "Login reset database settings")
  logout = context("POST", "/signout", {"csrf_token" => generate_response(alice_sid, {":signout"}, HMAC_KEY)}, "SID=#{alice_sid}; #{cookie_header}")
  Invidious::Routes::BeforeAll.handle(logout)
  Invidious::Routes::Login.signout(logout)
  check(logout.response.cookies["SID"].expires == Time.unix(0) && logout.response.cookies[Invidious::BrowserProfiles::MARKER].value == "guest", "Logout did not return to guest profile")
  check(logout.response.cookies["PREFS"]?.nil? && logout.response.cookies["SEARCH_INCLUDE_BLOCKED_#{bob}"]?.nil?, "Logout cleared guest or other account settings")
  guest = context("GET", "/preferences", cookies: cookie_header)
  Invidious::Routes::BeforeAll.handle(guest)
  check(guest.get("preferences").as(Preferences).speed == 0.75, "Guest preferences did not return after logout")

  # Browser signup uses defaults, even if the guest has customized settings.
  signup_get = context("GET", "/signup", cookies: cookie_header)
  token = Invidious::Authentication.form_token(signup_get, "signup")
  binding = signup_get.response.cookies["AUTH_CSRF"].value
  signup = context("POST", "/signup", {"csrf_token" => token, "username" => "ProfileSignup", "password" => password, "password_confirmation" => password}, "#{cookie_header}; AUTH_CSRF=#{binding}")
  Invidious::Routes::BeforeAll.handle(signup)
  Invidious::Routes::Login.signup(signup)
  check(signup.response.status_code == 302, "Profile signup failed")
  signup_email = Invidious::Database::SessionIDs.select_email(signup.response.cookies["SID"].value).not_nil!
  check(Invidious::Database::Users.select!(email: signup_email).preferences.speed == CONFIG.default_user_preferences.speed, "Signup inherited guest settings")

  alice_sid = accounts.authenticate("ProfileAlice", password).not_nil!
  replacement = accounts.change(alice_email, alice_sid, password, username: "ProfileRenamed").not_nil!
  check(profiles.account_scope(Invidious::Database::SessionIDs.select_email(replacement).not_nil!) == alice, "Rename changed browser profile")
  csrf = security_request("GET", "/api/v1/auth/csrf", replacement)
  check(csrf.response.headers["X-Invidious-Browser-Profile"] == alice, "CSRF response omitted storage-denial profile guard")
  expired = security_request("GET", "/api/v1/auth/preferences", alice_sid)
  check(expired.response.status_code == 403 && expired.response.cookies[Invidious::BrowserProfiles::MARKER].value == "guest", "Revoked session did not invalidate browser profile")
  bearer = generate_token(alice_email, ["GET:preferences"], nil, HMAC_KEY, replacement)
  native = security_request("GET", "/api/v1/auth/preferences", bob_sid, bearer)
  check(native.response.cookies[Invidious::BrowserProfiles::MARKER]?.nil? && native.response.cookies["SID"]?.nil? && native.response.headers["X-Invidious-Browser-Profile"]?.nil?, "Bearer request changed browser identity")

  before_guest = Invidious::Database::Users.select!(email: bob_email).preferences.to_json
  guest_channel = context("POST", "/preferences/sponsorblock/channels", {"channel" => "UC" + "a" * 22, "enabled" => "true"}, cookie_header)
  Invidious::Routes::BeforeAll.handle(guest_channel)
  Invidious::Routes::SponsorBlockPreferences.update(guest_channel)
  check(guest_channel.response.status_code == 403 && Invidious::Database::Users.select!(email: bob_email).preferences.to_json == before_guest, "Guest channel action wrote account preferences")

  # Delete only this account's browser cookies; the next document purges its storage.
  deletion = context("POST", "/delete_account", {"password" => password, "csrf_token" => generate_response(replacement, {":delete_account"}, HMAC_KEY)}, "SID=#{replacement}; #{cookie_header}; SEARCH_SHOW_MEMBER_VIDEOS_#{alice}=0")
  Invidious::Routes::BeforeAll.handle(deletion)
  Invidious::Routes::Account.post_delete(deletion)
  check(deletion.response.status_code == 302 && deletion.response.cookies[Invidious::BrowserProfiles::PURGE].value == alice, "Account deletion omitted browser cleanup")
  check(deletion.response.cookies["SEARCH_SHOW_MEMBER_VIDEOS_#{alice}"].expires == Time.unix(0), "Deleted profile cookie survived")
  check(deletion.response.cookies["PREFS"]?.nil? && deletion.response.cookies["SEARCH_INCLUDE_BLOCKED_#{bob}"]?.nil?, "Deletion cleared other profiles")
  puts "Browser profile defaults, guest preservation, account isolation, credential rotation, bearer compatibility and deletion passed"
ensure
  CONFIG.registration_enabled = registration unless registration.nil?
end

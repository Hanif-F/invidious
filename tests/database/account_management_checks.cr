# Uses the account harness's guarded, disposable database and production middleware.
def account_result(env)
  JSON.parse(env.get("test_result").as(String))
end

def check_mobile_account_management
  CONFIG.login_enabled = true
  CONFIG.registration_enabled = true
  CONFIG.captcha_enabled = false
  PG_DB.exec("DELETE FROM auth_rate_limits")
  password = "a unique native management password"
  path = "/api/v1/mobile/register"
  body = {username: "NativeManager", password: password, passwordConfirmation: password}.to_json
  config = security_request("GET", "/api/v1/mobile/registration")
  check(account_result(config)["registrationEnabled"].as_bool, "Native registration unavailable")
  register = security_request("POST", path, body: body)
  check(register.response.status_code == 200 && register.response.cookies.empty?, "Native registration failed or issued browser credentials")
  check(register.response.headers["Cache-Control"] == "private, no-store", "Registration response cached")
  token = account_result(register)["accessToken"].as_s
  sid = JSON.parse(token)["session"].as_s
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  check(security_request("POST", path, body: body).response.status_code == 409, "Duplicate native registration accepted")
  check(PG_DB.query_one("SELECT count(*) FROM session_ids WHERE email = $1", email, as: Int64) == 1, "Registration left an extra browser session")
  CONFIG.registration_enabled = false
  check(security_request("POST", path, body: body).response.status_code == 403, "Disabled registration bypassed")
  CONFIG.registration_enabled = true
  bad = security_request("POST", "/api/v1/auth/account/username", bearer: token, body: {username: "NativeRenamed", password: "wrong"}.to_json)
  check(bad.response.status_code == 401 && account_result(bad)["code"].as_s == "invalid_password", "Wrong password indistinguishable from bearer expiry")
  check(Invidious::Database::SessionIDs.select_email(sid) == email, "Wrong password revoked the session")

  browser = Invidious::Database::Accounts.authenticate("NativeManager", password).not_nil!
  other = Invidious::Database::Accounts.register("OtherNativeManager", password, Preferences.from_json("{}"))
  other_email = Invidious::Database::SessionIDs.select_email(other).not_nil!
  list = security_request("GET", "/api/v1/auth/account/sessions", bearer: token)
  entries = account_result(list).as_a
  check(entries.size == 2 && entries.count { |entry| entry["current"].as_bool } == 1, "Session list incomplete")
  check(!list.get("test_result").as(String).includes?(browser), "Browser credential exposed by native management")
  revoke_path = "/api/v1/auth/account/sessions/revoke"
  foreign = Invidious::Database::Accounts.management_id(other_email, other)
  check(security_request("POST", revoke_path, bearer: token, body: {id: foreign}.to_json).response.status_code == 404, "Foreign session handle accepted")
  browser_id = entries.find { |entry| entry["type"].as_s == "browser" }.not_nil!["id"].as_s
  check(security_request("POST", revoke_path, bearer: token, body: {id: browser_id}.to_json).response.status_code == 204, "Browser revocation failed")
  check(Invidious::Database::SessionIDs.select_email(browser).nil? && Invidious::Database::SessionIDs.select_email(other) == other_email, "Revocation crossed accounts")

  token_path = "/api/v1/auth/account/tokens"
  expires = Time.utc.to_unix + 3600
  authorized = security_request("POST", token_path, bearer: token, body: {password: password, scopes: ["GET:preferences"], expiresAt: expires}.to_json)
  check(authorized.response.status_code == 200, "Password-confirmed token authorization failed")
  delegated = account_result(authorized)["accessToken"].as_s
  check(security_request("GET", "/api/v1/auth/preferences", bearer: delegated).response.status_code == 200, "Authorized permission missing")
  check(security_request("GET", "/api/v1/auth/account/sessions", bearer: delegated).response.status_code == 403, "Delegated token gained account management")
  check(!scopes_include_scope(JSON.parse(token)["scopes"].as_a.map(&.as_s), "POST:tokens/register"), "Native session gained unrestricted delegated issuance")
  invalid = security_request("POST", token_path, bearer: token, body: {password: password, scopes: ["GET:preferences"], expiresAt: "bad"}.to_json)
  check(invalid.response.status_code == 400, "Malformed expiry became a never-expiring token")

  # Changing credentials must preserve linked data and atomically invalidate all tokens.
  PG_DB.exec("UPDATE users SET subscriptions = ARRAY['UCaaaaaaaaaaaaaaaaaaaaaa'] WHERE email = $1", email)
  rename = security_request("POST", "/api/v1/auth/account/username", bearer: token, body: {password: password, username: "NativeRenamed"}.to_json)
  check(rename.response.status_code == 200, "Native rename failed")
  replacement = account_result(rename)["accessToken"].as_s
  check(account_result(rename)["username"].as_s == "NativeRenamed", "Replacement session has old username")
  check(Invidious::Database::SessionIDs.select_email(sid).nil?, "Rename retained the previous session")
  check(security_request("GET", "/api/v1/auth/preferences", bearer: delegated).response.status_code == 403, "Credential change retained delegated token")
  check(Invidious::Database::Users.select!(email: email).subscriptions == ["UCaaaaaaaaaaaaaaaaaaaaaa"], "Rename lost subscriptions or identity")
  replacement_sid = JSON.parse(replacement)["session"].as_s
  # A simultaneous old-password issuance and password change serialize on the account.
  new_password = "another unusual native password"
  signals = Channel(Nil).new(2)
  spawn { Invidious::Database::Accounts.authenticate_mobile("NativeRenamed", password); signals.send(nil) }
  changed = Invidious::Database::Accounts.change_mobile(email, replacement_sid, password, new_password: new_password)
  signals.receive
  check(Invidious::Database::Accounts.authenticate_mobile("NativeRenamed", password).nil?, "Old password still works")
  check(PG_DB.query_one("SELECT count(*) FROM session_ids WHERE email = $1", email, as: Int64) == 1, "Concurrent credential change left an old token alive")
  replacement = changed[:accessToken]

  # CAPTCHA challenges bind to the native route, expire, and consume their nonce.
  CONFIG.captcha_enabled = true
  answer = OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, "1:05:10")
  captcha = generate_response(answer, {"POST:api/v1/mobile/register"}, HMAC_KEY, use_nonce: true)
  captcha_body = {username: "NativeCaptcha", password: password, passwordConfirmation: password, captchaAnswer: "1:05:10", captchaToken: captcha}.to_json
  check(security_request("POST", path, body: captcha_body).response.status_code == 200, "Native CAPTCHA rejected")
  check(security_request("POST", path, body: captcha_body).response.status_code == 400, "Native CAPTCHA replay accepted")
  web_captcha = generate_response(answer, {"POST:signup"}, HMAC_KEY, use_nonce: true)
  wrong_route = {username: "NativeWrongRoute", password: password, passwordConfirmation: password, captchaAnswer: "1:05:10", captchaToken: web_captcha}.to_json
  check(security_request("POST", path, body: wrong_route).response.status_code == 400, "Web CAPTCHA bypassed native route binding")
  expired_captcha = generate_response(answer, {"POST:api/v1/mobile/register"}, HMAC_KEY, -1.second, use_nonce: true)
  expired_body = {username: "NativeExpiredCaptcha", password: password, passwordConfirmation: password, captchaAnswer: "1:05:10", captchaToken: expired_captcha}.to_json
  check(security_request("POST", path, body: expired_body).response.status_code == 400, "Expired native CAPTCHA accepted")
  CONFIG.captcha_enabled = false
  PG_DB.exec("DELETE FROM auth_rate_limits")
  deleted = security_request("POST", "/api/v1/auth/account/delete", bearer: replacement, body: {password: new_password}.to_json)
  check(deleted.response.status_code == 204, "Native account deletion failed")
  check(Invidious::Database::Users.select(email: email).nil?, "Deleted native account remains")
  check(Invidious::Database::SessionIDs.select_email(JSON.parse(replacement)["session"].as_s).nil?, "Account deletion retained its session")
  captcha_login = Invidious::Database::Accounts.authenticate_mobile("NativeCaptcha", password).not_nil![:accessToken]
  current = account_result(security_request("GET", "/api/v1/auth/account/sessions", bearer: captcha_login)).as_a.find { |entry| entry["current"].as_bool }.not_nil!
  check(security_request("POST", revoke_path, bearer: captcha_login, body: {id: current["id"].as_s}.to_json).response.status_code == 204, "Current-session revocation failed")
  check(security_request("GET", "/api/v1/auth/account/sessions", bearer: captcha_login).response.status_code == 403, "Revoked current session remains active")
  puts "Native registration/CAPTCHA, account changes, scoped token authorization, opaque session management and deletion passed"
end

# Production D7 browser routes and existing native clients; disposable PostgreSQL.
def check_account_surfaces
  old_login = CONFIG.login_enabled
  CONFIG.login_enabled = true
  password = "account surface disposable password"
  store = Invidious::Database::Accounts
  alice_sid = store.register("SurfaceAlice", password, Preferences.from_json("{}"))
  alice = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(alice_sid).not_nil!)
  bob_sid = store.register("SurfaceBob", password, Preferences.from_json("{}"))
  bob = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(bob_sid).not_nil!)
  form_type = "application/x-www-form-urlencoded"
  read = ->(path : String) { security_request("GET", path, alice_sid) }
  result_html = ->(env : HTTP::Server::Context) { env.get("test_result").as(String) }
  %w(/account /change_password /delete_account /token_manager /authorize_token /tv).each do |path|
    result = read.call(path)
    check(result.response.status_code == 200, "Account surface failed: #{path}")
    check(result.response.headers["Cache-Control"] == "private, no-store", "Account surface is cacheable: #{path}")
    check(result_html.call(result).includes?("data-overhaul"), "Account surface retained legacy shell: #{path}")
    check(!result_html.call(result).includes?("/js/enhancements.js"), "Account surface loaded browsing consumers")
  end
  check(read.call("/account").response.headers["Referrer-Policy"] == "no-referrer", "Account page permits referrer leakage")
  check(security_request("GET", "/account").response.status_code == 302, "Guest account controls exposed")
  rename_csrf = Invidious::Helpers::Tokens.generate_response(alice_sid, {"POST:account/username"}, HMAC_KEY)
  draft = %(<bad>" retained & username)
  failure = security_request("POST", "/account/username", alice_sid, body: URI::Params.encode({"csrf_token" => rename_csrf, "username" => draft, "password" => password}), content_type: form_type)
  html = result_html.call(failure)
  check(failure.response.status_code == 400 && !html.includes?(password), "Rename failure leaked password or wrong status")
  check(XML.parse_html(html).xpath_node("//input[@id='username']").not_nil!["value"] == draft, "Failed literal username draft lost")
  check(Invidious::Database::Users.select!(email: alice.email).username == "SurfaceAlice", "Failed rename mutated identity")
  invalid = security_request("POST", "/account/username", alice_sid, body: URI::Params.encode({"username" => "DraftAfterCsrf", "password" => password}), content_type: form_type)
  check(invalid.response.status_code == 400 && XML.parse_html(result_html.call(invalid)).xpath_node("//input[@id='username']").not_nil!["value"] == "DraftAfterCsrf", "CSRF failure lost rename draft")
  duplicate = security_request("POST", "/account/username", alice_sid, body: URI::Params.encode({"csrf_token" => rename_csrf, "username" => "SurfaceBob", "password" => password}), content_type: form_type)
  check(duplicate.response.status_code == 400 && result_html.call(duplicate).includes?("Username is already taken."), "Duplicate username failure not actionable")
  delete_csrf = Invidious::Helpers::Tokens.generate_response(alice_sid, {"POST:delete_account"}, HMAC_KEY)
  bad_delete = security_request("POST", "/delete_account?referer=%2Faccount", alice_sid, body: URI::Params.encode({"csrf_token" => delete_csrf, "password" => "secret-wrong-password"}), content_type: form_type)
  html = result_html.call(bad_delete)
  check(bad_delete.response.status_code == 401 && html.includes?("Incorrect password") && !html.includes?("secret-wrong-password"), "Deletion failure not private/actionable")
  check(!!XML.parse_html(html).xpath_node("//form[contains(@action, '/delete_account')]"), "Deletion failure lost retry form")
  cancel = XML.parse_html(html).xpath_node("//a[text()='Cancel']").not_nil!
  check(cancel["href"] == "/account", "Delete cancellation was URL-form-encoded")
  check(!!Invidious::Database::Users.select(email: alice.email), "Bad deletion removed account")
  auth_csrf = Invidious::Helpers::Tokens.generate_response(alice_sid, {"POST:authorize_token"}, HMAC_KEY)
  scopes = ["GET:subscriptions", %(GET:history" autofocus onfocus="alert(1))]
  callback = %(tividious://authorize/path?label="quoted"&value=<escaped>)
  consent = read.call("/authorize_token?#{URI::Params.encode({"callback_url" => callback, "scopes" => scopes.join(","), "expire" => "2000000000"})}")
  tree = XML.parse_html(result_html.call(consent))
  check(tree.xpath_node("//input[@name='callbackUrl']").not_nil!["value"] == callback, "Custom callback changed in consent")
  check(tree.xpath_node("//input[@name='scopes[1]']").not_nil!["value"] == scopes[1], "Scope escaped incorrectly")
  check(tree.xpath_nodes("//*[@autofocus or @onfocus]").empty?, "Consent contains injected attributes")
  check(tree.xpath_node("//a[text()='Cancel']").not_nil!["href"] == "/token_manager", "Cancel navigates arbitrary callback")
  before = PG_DB.query_one("SELECT count(*) FROM session_ids WHERE email = $1", alice.email, as: Int64)
  {"javascript:alert(1)", "JaVaScRiPt:alert(1)", " data:text/html,test", "data:text/html,<script>", "file:///tmp/private", "https://example.test/\r\nInjected:value"}.each do |url|
    rejected = security_request("POST", "/authorize_token", alice_sid, body: URI::Params.encode({"csrf_token" => auth_csrf, "callbackUrl" => url}), content_type: form_type)
    check(rejected.response.status_code == 400, "Unsafe callback accepted")
  end
  check(PG_DB.query_one("SELECT count(*) FROM session_ids WHERE email = $1", alice.email, as: Int64) == before, "Invalid callback issued orphan tokens")
  issued = security_request("POST", "/authorize_token", alice_sid, body: URI::Params.encode({"csrf_token" => auth_csrf, "scopes[0]" => scopes[0], "scopes[1]" => scopes[1], "callbackUrl" => callback, "expire" => "2000000000"}), content_type: form_type)
  check(issued.response.status_code == 302, "Custom native callback authorization failed")
  destination = URI.parse(issued.response.headers["Location"])
  check(destination.scheme == "tividious" && destination.host == "authorize", "Native callback scheme or host changed")
  query = URI::Params.parse(destination.query.not_nil!)
  access = JSON.parse(URI.decode_www_form(query["token"]))
  check(access["scopes"].as_a.map(&.as_s) == scopes && access["expire"].as_i64 == 2000000000_i64, "Approved scopes or expiry changed")
  check(query["username"] == alice.username && query["label"] == "\"quoted\"", "Callback client query or username lost")
  token_sid = access["session"].as_s
  check(Invidious::Database::SessionIDs.select_email(token_sid) == alice.email, "Issued token has wrong owner")
  plain = security_request("POST", "/authorize_token", alice_sid, body: URI::Params.encode({"csrf_token" => auth_csrf, "scopes[0]" => scopes[1]}), content_type: form_type)
  private_token = XML.parse_html(result_html.call(plain)).xpath_node("//pre[@class='issued-token']/code").not_nil!.content
  parsed = JSON.parse(private_token)
  check(parsed["scopes"][0].as_s == scopes[1], "Explicit token view corrupted token")
  check(!result_html.call(plain).includes?("autofocus onfocus=\"alert"), "Issued token became HTML")
  # Browser-cookie API entry keeps the consent page and custom callback/scopes.
  api_consent = security_request("POST", "/api/v1/auth/tokens/register", alice_sid, body: URI::Params.encode({"csrf_token" => Invidious::Helpers::Tokens.generate_response(alice_sid, {"POST:tokens/register"}, HMAC_KEY), "scopes[0]" => scopes[0], "callbackUrl" => callback}), content_type: form_type)
  check(api_consent.response.status_code == 200 && result_html.call(api_consent).includes?("data-overhaul"), "Cookie API consent lost shared account shell")
  wide = security_request("POST", "/api/v1/auth/tokens/register", alice_sid, body: {"scopes" => scopes, "expire" => Int64::MAX}.to_json, csrf: Invidious::Helpers::Tokens.generate_response(alice_sid, {"POST:tokens/register"}, HMAC_KEY))
  check(wide.response.status_code == 200 && XML.parse_html(result_html.call(wide)).xpath_node("//input[@name='expire']").not_nil!["value"] == Int64::MAX.to_s, "Cookie API consent cannot display native Int64 expiry")
  wide_issued = security_request("POST", "/authorize_token", alice_sid, body: URI::Params.encode({"csrf_token" => auth_csrf, "expire" => Int64::MAX.to_s}), content_type: form_type)
  wide_token = JSON.parse(XML.parse_html(result_html.call(wide_issued)).xpath_node("//pre[@class='issued-token']/code").not_nil!.content)
  check(wide_token["expire"].as_i64 == Int64::MAX, "Browser approval dropped the native Int64 expiry")
  manager = read.call("/token_manager")
  tree = XML.parse_html(result_html.call(manager))
  check(!tree.xpath_node("//main").not_nil!.content.includes?(alice_sid) && !tree.xpath_node("//main").not_nil!.content.includes?(token_sid), "Session list displays raw credentials")
  check(tree.xpath_nodes("//input[@name='session']").size >= 3, "Ordinary revocation forms lost sessions")
  revoke_csrf = Invidious::Helpers::Tokens.generate_response(alice_sid, {"POST:token_ajax"}, HMAC_KEY)
  cross = security_request("POST", "/token_ajax?action=revoke_token&redirect=false", alice_sid, body: URI::Params.encode({"csrf_token" => revoke_csrf, "session" => bob_sid}), content_type: form_type)
  check(cross.response.status_code == 200 && Invidious::Database::SessionIDs.select_email(bob_sid) == bob.email, "Revocation crossed account boundary")
  denied = security_request("POST", "/token_ajax?action=revoke_token&redirect=false", alice_sid, body: URI::Params.encode({"session" => token_sid}), content_type: form_type)
  check(denied.response.status_code == 400 && Invidious::Database::SessionIDs.select_email(token_sid) == alice.email, "Revocation bypassed CSRF")
  removed = security_request("POST", "/token_ajax?action=revoke_token&referer=%2Ftoken_manager", alice_sid, body: URI::Params.encode({"csrf_token" => revoke_csrf, "session" => token_sid}), content_type: form_type)
  check(removed.response.status_code == 302 && Invidious::Database::SessionIDs.select_email(token_sid).nil?, "Body session revocation failed")
  check(removed.response.headers["Cache-Control"] == "private, no-store", "Revocation response is cacheable")
  legacy = security_request("POST", "/token_ajax?action=revoke_token&session=#{URI.encode_www_form(parsed["session"].as_s)}&redirect=false", alice_sid, body: URI::Params.encode({"csrf_token" => revoke_csrf}), content_type: form_type)
  check(legacy.response.status_code == 200 && Invidious::Database::SessionIDs.select_email(parsed["session"].as_s).nil?, "Legacy query revocation broke")
  renamed = security_request("POST", "/account/username", alice_sid, body: URI::Params.encode({"csrf_token" => rename_csrf, "username" => "SurfaceRenamed", "password" => password}), content_type: form_type)
  check(renamed.response.status_code == 302 && Invidious::Database::SessionIDs.select_email(alice_sid).nil?, "Successful rename did not rotate session")
  new_sid = renamed.response.cookies["SID"].value
  deletion = security_request("POST", "/delete_account?referer=%2Faccount", new_sid, body: URI::Params.encode({"csrf_token" => Invidious::Helpers::Tokens.generate_response(new_sid, {"POST:delete_account"}, HMAC_KEY), "password" => password}), content_type: form_type)
  check(deletion.response.status_code == 302 && Invidious::Database::Users.select(email: alice.email).nil?, "Confirmed browser deletion failed")
  check(Invidious::Database::SessionIDs.select_email(new_sid).nil? && Invidious::Database::SessionIDs.select_email(bob_sid) == bob.email, "Deletion left access or changed another account")
  puts "D7 account surfaces passed: private forms, failed drafts, CSRF, native callbacks/scopes, token confidentiality, owner revocation, rotation and deletion"
ensure
  CONFIG.login_enabled = old_login unless old_login.nil?
end

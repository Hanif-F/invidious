# Included in the guarded account harness; no upstream requests or real accounts.
class PairingHttpTestEndpoint
  include HTTP::Handler

  def call(context)
    env = context
    Invidious::Routes::BeforeAll.handle(env)
    Kemal::RouteHandler::INSTANCE.call(env)
  end
end

def check_pairing_http
  # Exercise registered routes and real HTTP, including the existing login form.
  # Browser routes were registered by check_public_security in this harness.
  Invidious::Routing.register_tv_pairing_api_routes
  Invidious::Routing.get "/api/v1/auth/preferences", Invidious::Routes::API::V1::Authenticated, :get_preferences
  auth = AuthHandler.new
  auth.next = PairingHttpTestEndpoint.new
  server = HTTP::Server.new([auth])
  address = server.bind_tcp("127.0.0.1", 0)
  spawn { server.listen }
  client = HTTP::Client.new("127.0.0.1", address.port)
  begin
    start = client.post("/api/v1/tv/pairing/start", HTTP::Headers{"Content-Type" => "application/json"}, "{}")
    check(start.status_code == 200, "Registered HTTP start route failed")
    grant = JSON.parse(start.body)
    code = grant["userCode"].as_s
    device = grant["deviceCode"].as_s
    destination = "/tv?user_code=#{code}"
    visitor = client.get(destination)
    check(visitor.status_code == 302, "HTTP visitor did not reach browser login")
    login_path = visitor.headers["Location"]
    login = client.get(login_path)
    form = XML.parse_html(login.body).xpath_node("//form[contains(@action, '/login')]").not_nil!
    csrf = form.xpath_node(".//input[@name='csrf_token']").not_nil!["value"]
    headers = HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded", "Cookie" => "AUTH_CSRF=#{login.cookies["AUTH_CSRF"].value}"}
    signed_in = client.post(form["action"], headers, URI::Params.encode({"csrf_token" => csrf, "username" => "PairingAlice", "password" => "a disposable TV pairing password"}))
    check(signed_in.status_code == 302 && signed_in.headers["Location"] == destination, "HTTP login return lost pairing destination")
    sid = signed_in.cookies["SID"].value
    browser_headers = HTTP::Headers{"Cookie" => "SID=#{sid}"}
    page = client.get(destination, browser_headers)
    check(page.status_code == 200 && !page.body.includes?(device), "HTTP approval page failed or exposed private code")
    if preview = ENV["PAIRING_PREVIEW_DIR"]?
      Dir.mkdir_p(preview)
      # Rendered synthetic-account fixture only; replace all CSRF values before
      # saving the visual artifact. Never save private device/native credentials.
      File.write("#{preview}/tv-pairing.html", page.body.gsub(/name="csrf_token" value="[^"]*"/, "name=\"csrf_token\" value=\"fixture-token\""))
    end
    form = XML.parse_html(page.body).xpath_node("//form[@action='/tv']").not_nil!
    csrf = form.xpath_node(".//input[@name='csrf_token']").not_nil!["value"]
    browser_headers["Content-Type"] = "application/x-www-form-urlencoded"
    approved = client.post("/tv", browser_headers, URI::Params.encode({"user_code" => code, "decision" => "approve", "csrf_token" => csrf}))
    check(approved.status_code == 200 && approved.body.includes?("TV access approved"), "HTTP explicit approval failed")
    pairing_due(device)
    token = client.post("/api/v1/tv/pairing/token", HTTP::Headers{"Content-Type" => "application/json"}, {deviceCode: device}.to_json)
    check(token.status_code == 200, "HTTP native redemption failed")
    native = JSON.parse(token.body)["accessToken"].as_s
    preferences = client.get("/api/v1/auth/preferences", HTTP::Headers{"Authorization" => "Bearer #{native}"})
    check(preferences.status_code == 200, "HTTP paired session cannot authenticate")
  ensure
    client.close
    server.close
  end
end

def pairing_result(env)
  JSON.parse(env.get("test_result").as(String))
end

def pairing_due(device)
  PG_DB.exec("UPDATE tv_pairings SET poll_after = now() - interval '1 second' WHERE device_hash = $1", Invidious::Database::TvPairings.digest("device", device))
end

def pairing_poll(device)
  security_request("POST", "/api/v1/tv/pairing/token", body: {deviceCode: device}.to_json)
end

def pairing_submit(sid, code, decision = "approve", csrf = nil)
  csrf ||= generate_response(sid, {"POST:tv"}, HMAC_KEY, 10.minutes)
  body = URI::Params.encode({"user_code" => code, "decision" => decision, "csrf_token" => csrf})
  security_request("POST", "/tv", sid, body: body, content_type: "application/x-www-form-urlencoded")
end

def check_tv_pairing
  CONFIG.login_enabled = true
  PG_DB.exec("DELETE FROM auth_rate_limits")
  check(PG_DB.query_one("SELECT count(*) FROM invidious_migrations WHERE version = 23", as: Int64) == 1, "Pairing migration missing or repeated")
  store = Invidious::Database::TvPairings
  accounts = Invidious::Database::Accounts
  password = "a disposable TV pairing password"
  sid = accounts.register("PairingAlice", password, Preferences.from_json("{}"))
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  other_sid = accounts.register("PairingBob", password, Preferences.from_json("{}"))
  before = PG_DB.query_one("SELECT count(*) FROM session_ids", as: Int64)
  start = security_request("POST", "/api/v1/tv/pairing/start", body: "{}")
  check(start.response.status_code == 200 && start.response.cookies.empty?, "Pairing start failed or created browser state")
  check(start.response.headers["Cache-Control"] == "private, no-store", "Pairing code response may be cached")
  grant = pairing_result(start)
  device = grant["deviceCode"].as_s
  code = grant["userCode"].as_s
  check(device.matches?(/\A[A-Za-z0-9_-]{43}\z/) && code.matches?(/\A[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}\z/), "Pairing code entropy/format changed")
  check(grant["expiresIn"] == 600 && grant["pollInterval"] == 5, "Pairing lifetime/interval changed")
  check(grant["verificationUri"] == "#{HOST_URL}/tv" && grant["verificationUriComplete"] == "#{HOST_URL}/tv?user_code=#{code}", "QR URL is not the public approval URL")
  host_env = context("POST", "/api/v1/tv/pairing/start")
  host_env.request.headers["Host"] = "attacker.test"
  host_env.request.headers["X-Forwarded-Host"] = "attacker.test"
  check(Invidious::Routes::API::V1::TvPairing.verification_uri(host_env) == "#{HOST_URL}/tv", "Untrusted host changed QR origin")
  CONFIG.alternative_domains << "tv-alias.test"
  host_env.request.headers["Host"] = "tv-alias.test"
  check(Invidious::Routes::API::V1::TvPairing.verification_uri(host_env) == "https://tv-alias.test/tv", "Configured alias is not same-origin")
  CONFIG.alternative_domains.delete("tv-alias.test")
  check(PG_DB.query_one("SELECT count(*) FROM session_ids", as: Int64) == before, "Start minted a credential")
  persisted = PG_DB.query_one("SELECT row_to_json(t)::text FROM tv_pairings t WHERE device_hash = $1", store.digest("device", device), as: String)
  check(!persisted.includes?(device) && !persisted.includes?(code.delete('-')), "Pairing secrets stored in plaintext")
  check(pairing_result(pairing_poll(device))["error"] == "slow_down", "Initial interval not enforced")
  check(PG_DB.query_one("SELECT poll_interval FROM tv_pairings WHERE device_hash = $1", store.digest("device", device), as: Int32) == 10, "Slowdown did not add five seconds")
  pairing_due(device)
  check(pairing_result(pairing_poll(device))["error"] == "authorization_pending", "Pending pairing did not wait")
  check(pairing_result(pairing_poll(device))["error"] == "slow_down", "Repeated poll bypassed interval")
  visitor = security_request("GET", "/tv?user_code=#{code.downcase}")
  check(visitor.response.headers["Location"] == "/login?referer=#{URI.encode_www_form("/tv?user_code=#{code}")}", "Login return lost public code")
  login_form = context("GET", visitor.response.headers["Location"])
  html = Invidious::Routes::Login.login_page(login_form).not_nil!
  check(html.includes?(URI.encode_www_form("/tv?user_code=#{code}")), "Login form lost approval destination")
  page = security_request("GET", "/tv?user_code=#{code}", sid)
  html = page.get("test_result").as(String)
  check(html.includes?("PairingAlice") && html.includes?(code) && html.includes?("Compare the code"), "Approval page lacks account and device intent")
  check(!html.includes?(device) && !html.includes?("accessToken"), "Approval HTML exposed private credentials")
  check(PG_DB.query_one("SELECT state FROM tv_pairings WHERE device_hash = $1", store.digest("device", device), as: String) == "pending", "QR GET approved access")
  wrong_csrf = generate_response(other_sid, {"POST:tv"}, HMAC_KEY)
  check(pairing_submit(sid, code, csrf: wrong_csrf).response.status_code == 400, "Wrong-account CSRF approved access")
  wrong_endpoint = generate_response(sid, {"POST:preferences"}, HMAC_KEY)
  check(pairing_submit(sid, code, csrf: wrong_endpoint).response.status_code == 400, "Wrong-endpoint CSRF approved access")
  approved = pairing_submit(sid, code.downcase.delete('-'))
  check(approved.response.status_code == 200 && approved.get("test_result").as(String).includes?("TV access approved"), "Explicit approval failed")
  check(pairing_submit(other_sid, code).response.status_code == 400, "Another account overwrote approval")
  pairing_due(device)
  # Both contenders pass the same account and grant locks. Only one may issue.
  outcomes = Channel(Invidious::Database::TvPairings::Credentials | String).new(2)
  2.times { spawn { outcomes.send(store.poll(device)) } }
  results = Array.new(2) { outcomes.receive }
  successes = results.select(Invidious::Database::TvPairings::Credentials)
  check(successes.size == 1 && results.includes?("invalid_grant"), "Concurrent redemption issued more than one credential")
  credential = successes.first
  check(credential[:username] == "PairingAlice" && credential[:profileId] == Invidious::BrowserProfiles.account_scope(email), "Pairing returned wrong account/profile")
  check((credential[:expiresAt] - Time.utc.to_unix - 30.days.total_seconds).abs < 3, "Pairing native expiry differs")
  check(security_request("GET", "/api/v1/auth/preferences", bearer: credential[:accessToken]).response.status_code == 200, "Paired native credential does not authenticate")
  check(PG_DB.query_one("SELECT count(*) FROM session_ids", as: Int64) == before + 1, "Redemption minted an extra session")
  check(pairing_result(pairing_poll(device))["error"] == "invalid_grant", "Consumed code reissued credentials")

  rollback = store.start
  check(pairing_submit(sid, rollback[:userCode]).response.status_code == 200, "Rollback fixture approval failed")
  pairing_due(rollback[:deviceCode])
  PG_DB.exec("CREATE FUNCTION reject_pairing_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic issuance failure'; END $$")
  PG_DB.exec("CREATE TRIGGER reject_pairing_session BEFORE INSERT ON session_ids FOR EACH ROW EXECUTE FUNCTION reject_pairing_session()")
  must_fail("Native issuance failure was hidden") { store.poll(rollback[:deviceCode]) }
  PG_DB.exec("DROP TRIGGER reject_pairing_session ON session_ids")
  PG_DB.exec("DROP FUNCTION reject_pairing_session()")
  check(PG_DB.query_one("SELECT state FROM tv_pairings WHERE device_hash = $1", store.digest("device", rollback[:deviceCode]), as: String) == "approved", "Failed native issuance consumed the grant")
  recovered = pairing_poll(rollback[:deviceCode])
  check(recovered.response.status_code == 200 && pairing_result(recovered)["profileId"] == credential[:profileId], "Token endpoint did not recover after rollback")
  check(recovered.response.cookies.empty? && recovered.response.headers["Cache-Control"] == "private, no-store", "Token endpoint created browser state or cacheable credentials")

  denied = store.start
  check(pairing_submit(sid, denied[:userCode], "deny").response.status_code == 200, "Deny failed")
  check(store.poll(denied[:deviceCode]) == "access_denied", "Denied grant did not stop polling")
  expired = store.start
  PG_DB.exec("UPDATE tv_pairings SET expires_at = now() - interval '1 second' WHERE device_hash = $1", store.digest("device", expired[:deviceCode]))
  check(store.poll(expired[:deviceCode]) == "expired_token", "Expired grant survived without cleanup")
  check(pairing_submit(sid, expired[:userCode]).response.status_code == 400, "Expired public code approved")
  store.delete_expired
  check(store.poll(expired[:deviceCode]) == "invalid_grant", "Cleanup retained expired grant")
  check(store.poll(denied[:deviceCode]) == "access_denied", "Cleanup removed unexpired terminal state")

  # Revocation and credential changes before redemption must prevent issuance.
  {"revoke", "password", "delete", "session-expiry"}.each_with_index do |action, i|
    owner_sid = accounts.register("PairingRevocation#{i}", password, Preferences.from_json("{}"))
    owner = Invidious::Database::SessionIDs.select_email(owner_sid).not_nil!
    pending = store.start
    check(store.decide(store.normalize(pending[:userCode]).not_nil!, owner, owner_sid, true), "Revocation fixture approval failed")
    case action
    when "revoke"         then Invidious::Database::SessionIDs.delete(sid: owner_sid)
    when "password"       then accounts.change(owner, owner_sid, password, new_password: "a changed disposable pairing password")
    when "delete"         then check(accounts.delete(owner, owner_sid, password), "Fixture account deletion failed")
    when "session-expiry" then PG_DB.exec("UPDATE session_ids SET expires_at = now() - interval '1 second' WHERE id = $1", owner_sid)
    end
    pairing_due(pending[:deviceCode])
    check(store.poll(pending[:deviceCode]) == "access_denied", "#{action} allowed redemption")
  end

  # Public JSON is bounded and failures do not allocate grants.
  count = PG_DB.query_one("SELECT count(*) FROM tv_pairings", as: Int64)
  {"[]", "{", "x" * 16_385, %({"unexpected":true})}.each do |body|
    check(security_request("POST", "/api/v1/tv/pairing/start", body: body).response.status_code == 400, "Malformed pairing start accepted")
  end
  check(PG_DB.query_one("SELECT count(*) FROM tv_pairings", as: Int64) == count, "Invalid JSON allocated a grant")
  PG_DB.exec("DELETE FROM auth_rate_limits")
  5.times { check(security_request("POST", "/api/v1/tv/pairing/start", body: "{}").response.status_code == 200, "Start throttle too strict") }
  limited = security_request("POST", "/api/v1/tv/pairing/start", body: "{}")
  check(limited.response.status_code == 429 && limited.response.headers["Retry-After"].to_i > 0, "Start burst limit missing")
  PG_DB.exec("DELETE FROM auth_rate_limits")
  20.times { accounts.throttle("tv-start-hour:local", 20, 3600) }
  check(security_request("POST", "/api/v1/tv/pairing/start", body: "{}").response.status_code == 429, "Hourly start limit missing")
  PG_DB.exec("DELETE FROM auth_rate_limits")
  5.times { check(pairing_submit(sid, "ZZZZ-ZZZZ").response.status_code == 400, "Bad verification failed unexpectedly") }
  limited = pairing_submit(sid, "ZZZZ-ZZZZ")
  check(limited.response.status_code == 429 && limited.response.headers["Retry-After"].to_i > 0, "Public-code guessing limit missing")
  still_pending = store.start
  check(pairing_submit(sid, still_pending[:userCode]).response.status_code == 429, "Throttled client may still verify codes")
  check(PG_DB.query_one("SELECT state FROM tv_pairings WHERE device_hash = $1", store.digest("device", still_pending[:deviceCode]), as: String) == "pending", "Throttled verification mutated the grant")
  PG_DB.exec("DELETE FROM auth_rate_limits")
  30.times { check(pairing_poll("A" * 43).response.status_code == 400, "Invalid private-code response changed") }
  check(pairing_poll("A" * 43).response.status_code == 429, "Invalid device-code limit missing")
  CONFIG.login_enabled = false
  check(security_request("POST", "/api/v1/tv/pairing/start", body: "{}").response.status_code == 403, "Disabled login allows pairing")
  check(pairing_poll(device).response.status_code == 403, "Disabled login allows redemption")
  CONFIG.login_enabled = true
  check(Invidious::LogHandler.redacted_path("/tv?user_code=#{code}") == "/tv", "Public code appeared in access log")
  PG_DB.exec("DELETE FROM auth_rate_limits")
  check_pairing_http
  puts "TV pairing migration, explicit approval, CSRF, throttling, atomic redemption, native credentials, revocation and cleanup passed"
end

# Loaded only by accounts.cr, against its guarded disposable PostgreSQL database.
class RequiredLoginTestEndpoint
  include HTTP::Handler
  class_property content_calls = 0

  def call(context)
    env = context
    path = env.request.path
    if path.starts_with?("/api/v1/auth/") || path.starts_with?("/api/v1/mobile/") || path.starts_with?("/api/v1/tv/")
      SecurityTestEndpoint.new.call(env)
      env.response.print(env.get("test_result").as(String)) unless env.response.closed?
      return
    end
    Invidious::Routes::BeforeAll.handle(env)
    result = case path
             when "/login"
               env.request.method == "POST" ? Invidious::Routes::Login.login(env) : Invidious::Routes::Login.login_page(env)
             when "/signup"
               env.request.method == "POST" ? Invidious::Routes::Login.signup(env) : Invidious::Routes::Login.signup_page(env)
             when "/signout"
               Invidious::Routes::Login.signout(env)
             when "/preferences"
               env.request.method == "POST" ? Invidious::Routes::PreferencesRoute.update(env) : Invidious::Routes::PreferencesRoute.show(env)
             when "/feed/private"
               Invidious::Routes::Feeds.rss_private(env)
             when "/api/v1/playlists/IVgate"
               env.params.url["plid"] = "IVgate"
               Invidious::Routes::API::V1::Misc.get_playlist(env)
             when .starts_with?("/feed/webhook/")
               env.params.url["token"] = path.split('/').last
               env.request.method == "POST" ? Invidious::Routes::Feeds.push_notifications_post(env) : Invidious::Routes::Feeds.push_notifications_get(env)
             when "/verify"
               Invidious::Routes::Verification.page(env)
             when "/api/v1/verification"
               Invidious::Routes::Verification.status(env)
             when "/api/v1/verification/complete"
               Invidious::Routes::Verification.complete(env)
             else
               # A sentinel stands in for any expensive content/upstream handler.
               self.class.content_calls += 1
               env.response.headers["X-Test-User"] = env.get?("authentication_user").try(&.as(Invidious::User).username) || "guest"
               env.response.headers["X-Test-Account-User"] = env.get?("user").try(&.as(Invidious::User).username) || "none"
               env.response.headers["Cache-Control"] = "public, max-age=3600"
               env.response.headers["Vary"] = "Accept-Encoding"
               "content"
             end
    env.response.print(result.to_s) unless env.response.closed?
  end
end

def required_login_response(method, path, sid = nil, bearer = nil, body = "", content_type = "application/json", csrf = nil, cookies = nil, extra_headers = {} of String => String)
  headers = HTTP::Headers{"Content-Type" => content_type}
  extra_headers.each { |name, value| headers[name] = value }
  headers["Cookie"] = cookies || "SID=#{sid}" if cookies || sid
  headers["Authorization"] = "Bearer #{bearer}" if bearer
  headers["X-CSRF-Token"] = csrf if csrf
  io = IO::Memory.new
  env = HTTP::Server::Context.new(HTTP::Request.new(method, path, headers, body), HTTP::Server::Response.new(io))
  gate = Invidious::HttpServer::RequiredLoginHandler.new
  bot = Invidious::HttpServer::BotProtectionHandler.new
  auth = AuthHandler.new
  gate.next = bot
  bot.next = auth
  assets = {% if compare_versions(Crystal::VERSION, "1.17.0-dev") >= 0 %}
             Invidious::HttpServer::StaticAssetsHandler.new("assets", directory_listing: false)
           {% else %}
             Kemal::StaticFileHandler.new("assets")
           {% end %}
  auth.next = assets
  assets.next = RequiredLoginTestEndpoint.new
  head = Kemal::HeadRequestHandler::INSTANCE
  head.next = gate
  head.call(env)
  env.response.close unless env.response.closed?
  HTTP::Client::Response.from_io(IO::Memory.new(io.to_s), ignore_body: method == "HEAD")
end

def check_required_login
  original = CONFIG.to_yaml
  temporary = File.tempname("invidious-required-login")
  begin
    check(!Config.from_yaml("{}").login_required, "Required login must default off")
    config_environment = %w[INVIDIOUS_CONFIG INVIDIOUS_LOGIN_REQUIRED INVIDIOUS_LOGIN_ENABLED].to_h { |key| {key, ENV[key]?} }
    begin
      ENV["INVIDIOUS_CONFIG"] = "hmac_key: gate-config-test\ndatabase_url: postgres://localhost/unused\nlogin_required: false\n"
      ENV["INVIDIOUS_LOGIN_REQUIRED"] = "true"
      ENV["INVIDIOUS_LOGIN_ENABLED"] = "false"
      loaded = Config.load
      check(loaded.login_required && loaded.login_enabled, "Environment configuration can disable login on a private instance")
      check(Config.from_yaml(loaded.to_yaml).login_required, "Required login does not persist in YAML")
    ensure
      config_environment.each do |key, value|
        if value
          ENV[key] = value
        else
          ENV.delete(key)
        end
      end
    end
    CONFIG.login_enabled = true
    CONFIG.login_required = false
    CONFIG.captcha_enabled = false
    CONFIG.registration_enabled = true
    Invidious::BotProtection.save(false, 12)
    open = required_login_response("GET", "/watch?v=test")
    check(open.status_code == 200 && open.body == "content", "Default-off mode blocks guests")

    password = "a dedicated required login test password"
    sid = Invidious::Database::Accounts.register("GateAlice", password, Preferences.from_json("{}"))
    other_sid = Invidious::Database::Accounts.register("GateBob", password, Preferences.from_json("{}"))
    email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
    user = Invidious::Database::Users.select!(email: email)
    token = Invidious::Database::Accounts.authenticate_mobile(user.username, password).not_nil![:accessToken]
    restricted = generate_token(email, ["GET:preferences"], nil, HMAC_KEY, sid)
    CONFIG.login_required = true

    content_calls = RequiredLoginTestEndpoint.content_calls
    {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}.each do |method|
      {"/", "/watch?v=test&list=PLtest", "/embed/test", "/preferences", "/privacy", "/licenses", "/tv",
       "/unknown-future-route", "/not-a-local-file.js", "/login/extra", "/signup/extra",
       "/feed/channel/UCtest", "/feed/private/extra?token=#{user.token}", "/feed/webhook/token/extra", "/css/../config/config.yml"}.each do |path|
        response = required_login_response(method, path, body: "sensitive-body")
        check(response.status_code == 303 && response.headers["Location"].starts_with?("/login?referer="), "Anonymous page escaped gate: #{method} #{path}")
        check(!response.headers["Location"].includes?("sensitive-body"), "Redirect reflected a request body")
        check(response.headers["Cache-Control"] == "private, no-store", "Login redirect is cacheable")
      end
      {"/api/v1/videos/test", "/api/v1/auth/preferences", "/api/v1/stats", "/api/manifest/dash/id/test",
       "/videoplayback", "/latest_version?id=test", "/download", "/companion/latest_version",
       "/vi/test/a.jpg", "/sb/test/a.jpg", "/s_p/test", "/ggpht/test", "/yts/test",
       "/pl_c/test", "/tvfilm_banner/test", "/api/v1/mobile/login/extra"}.each do |path|
        response = required_login_response(method, path)
        if method == "OPTIONS"
          check(response.status_code == 204 && response.body.empty?, "CORS preflight returned content")
          check(response.headers["Access-Control-Allow-Headers"].includes?("Authorization"), "Preflight lost bearer support")
        else
          check(response.status_code == 401, "Anonymous content escaped gate: #{method} #{path}")
          unless method == "HEAD"
            failure = JSON.parse(response.body)
            check(failure["error"] == "login_required" && failure["loginUrl"].as_s.starts_with?("/login?referer="), "Missing native login discovery")
          end
        end
        check(response.headers["Access-Control-Allow-Origin"] == "*", "Blocked content lost CORS headers")
      end
    end
    check(RequiredLoginTestEndpoint.content_calls == content_calls, "Blocked request reached an upstream/content handler")

    asset = HTTP::Request.new("GET", "/css/default.css")
    check(Invidious::HttpServer::BotProtectionHandler.local_asset?(asset), "Login styles are inaccessible")
    check(required_login_response("GET", "/css/default.css").status_code == 200, "Real login stylesheet is blocked")
    check(required_login_response("HEAD", "/css/default.css").body.empty?, "Static HEAD returned content")
    check(!Invidious::HttpServer::BotProtectionHandler.local_asset?(HTTP::Request.new("GET", "/vi/test/a.jpg")), "Remote image treated as static asset")

    target = "/watch?v=test&list=PLtest&referer=%2Fsearch%3Fq%3Dhello"
    redirect = required_login_response("GET", target)
    referer = URI::Params.parse(URI.parse(redirect.headers["Location"]).query.not_nil!)["referer"]
    check(referer == target, "Gate lost the original page query")
    form = required_login_response("GET", redirect.headers["Location"])
    check(form.status_code == 200, "Login form is blocked")
    parsed = XML.parse_html(form.body)
    csrf = parsed.xpath_node("//form[starts-with(@action,'/login?')]/input[@name='csrf_token']").not_nil!["value"]
    fields = {"username" => user.username, "password" => password, "csrf_token" => csrf}
    signed_in = required_login_response("POST", redirect.headers["Location"], body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded", cookies: "AUTH_CSRF=#{form.cookies["AUTH_CSRF"].value}")
    check(signed_in.status_code == 302 && signed_in.headers["Location"]? == target, "Login did not return to the original page: #{signed_in.status_code}, #{signed_in.headers["Location"]?}")
    logout_sid = signed_in.cookies["SID"].value
    logout_csrf = generate_response(logout_sid, {"POST:signout"}, HMAC_KEY)
    required_login_response("POST", "/signout", logout_sid, body: URI::Params.encode({"csrf_token" => logout_csrf}), content_type: "application/x-www-form-urlencoded")
    check(required_login_response("GET", "/watch", logout_sid).status_code == 303, "Signed-out session retained content access")
    {"https://evil.test/path", "//evil.test/path", "/%2f%2fevil.test", "/%5cevil.test", "/watch%0d%0aLocation:evil", "/login", "/signup"}.each do |unsafe|
      check(Invidious::Authentication.safe_login_return(unsafe) == "/", "Unsafe login return accepted")
    end

    {"/watch?v=test", "/api/v1/videos/test", "/vi/test/a.jpg", "/companion/latest_version"}.each do |path|
      response = required_login_response("GET", path, sid)
      check(response.status_code == 200 && response.headers["X-Test-User"] == user.username, "Browser session rejected: #{path}")
      check(response.headers["Cache-Control"] == "private, no-store", "Upstream overwrote required-login cache policy")
      vary = response.headers["Vary"]
      check(vary.includes?("Cookie") && vary.includes?("Authorization") && vary.includes?("Accept-Encoding"), "Required-login Vary lost cache dimensions")
    end
    {"/api/v1/videos/test", "/vi/test/a.jpg", "/companion/latest_version"}.each do |path|
      response = required_login_response("GET", path, other_sid, token)
      check(response.status_code == 200 && response.headers["X-Test-User"] == user.username, "Cookie replaced bearer identity")
      check(!response.cookies.has_key?(Invidious::BrowserProfiles::MARKER), "Bearer request changed browser profile")
      check(response.headers["X-Test-Account-User"] == "none", "Instance access granted unscoped account identity")
    end
    check(required_login_response("GET", "/api/v1/videos/test", bearer: restricted).status_code == 200, "Existing limited token cannot read ordinary content")
    check(required_login_response("GET", "/api/v1/auth/tokens", bearer: restricted).status_code == 403, "Gate widened account token scopes")
    check(required_login_response("GET", "/api/v1/auth/preferences", bearer: restricted).status_code == 200, "Gate broke existing authorized scopes")
    PG_DB.exec("INSERT INTO playlists VALUES ('Gate private', 'IVgate', $1, '', 0, now(), now(), 'Private', ARRAY[]::bigint[])", email)
    check(required_login_response("GET", "/api/v1/playlists/IVgate", sid).status_code == 200, "Gate broke browser private-playlist ownership")
    check(required_login_response("GET", "/api/v1/playlists/IVgate", sid, restricted).status_code == 404, "Instance gate bypassed private-playlist scopes using a mixed cookie")
    check(required_login_response("GET", "/api/v1/auth/playlists/IVgate", bearer: restricted).status_code == 403, "Restricted token gained private-playlist permission")
    check(required_login_response("GET", "/api/v1/auth/playlists/IVgate", bearer: token).status_code == 200, "Native playlist scopes no longer allow private reads")
    check(required_login_response("POST", "/api/v1/auth/preferences", sid, body: "{}").status_code == 403, "Gate bypassed browser CSRF")
    check(required_login_response("PATCH", "/api/v1/auth/preferences", bearer: token, body: %({"autoplay":false})).status_code == 200, "Bearer writes acquired a browser CSRF requirement")

    expired = JSON.parse(token).as_h
    expired["expire"] = JSON::Any.new(Time.utc.to_unix - 1)
    expired["signature"] = JSON::Any.new(sign_token(HMAC_KEY, expired))
    forged = JSON.parse(token).as_h
    forged["signature"] = JSON::Any.new("forged")
    form_token = generate_response(sid, {":*"}, HMAC_KEY)
    {"malformed", expired.to_json, forged.to_json, form_token}.each do |invalid|
      check(required_login_response("GET", "/api/v1/videos/test", sid, invalid).status_code == 401, "Invalid bearer fell back to a valid cookie")
    end
    token_session = JSON.parse(token)["session"].as_s
    check(required_login_response("GET", "/api/v1/videos/test", token_session).status_code == 401, "API session accepted as SID cookie")
    check(required_login_response("GET", "/login", token_session).status_code == 200, "Invalid SID prevents login recovery")
    Invidious::Database::SessionIDs.delete(sid: token_session)
    check(required_login_response("GET", "/api/v1/videos/test", bearer: token).status_code == 401, "Revoked token retained instance access")
    PG_DB.exec("UPDATE session_ids SET expires_at = now() - interval '1 second' WHERE id = $1", JSON.parse(restricted)["session"].as_s)
    check(required_login_response("GET", "/api/v1/videos/test", bearer: restricted).status_code == 401, "Expired database token retained instance access")
    PG_DB.exec("UPDATE session_ids SET expires_at = now() - interval '1 second' WHERE id = $1", other_sid)
    check(required_login_response("GET", "/watch", other_sid).status_code == 303, "Expired browser session retained instance access")
    check(required_login_response("GET", "/api/v1/videos/test", "missing").status_code == 401, "Unknown browser session retained instance access")

    headers_env = context("GET", "/companion/latest_version", cookies: "SID=secret; AUTH_CSRF=secret")
    headers_env.request.headers["Authorization"] = "Bearer secret"
    headers_env.request.headers["X-CSRF-Token"] = "secret"
    headers_env.request.headers["Range"] = "bytes=0-10"
    forwarded = Invidious::Authentication.proxy_headers(headers_env)
    check(!forwarded.has_key?("Authorization") && !forwarded.has_key?("Cookie") && !forwarded.has_key?("X-CSRF-Token"), "Companion receives account credentials")
    check(forwarded["Range"] == "bytes=0-10" && headers_env.request.headers.has_key?("Authorization"), "Filtering corrupted playback or local authentication headers")

    signup = required_login_response("GET", "/signup")
    check(signup.status_code == 200 && required_login_response("GET", "/login").body.includes?("/signup?"), "Required login disabled permitted signup")
    signup_csrf = XML.parse_html(signup.body).xpath_node("//form[starts-with(@action,'/signup?')]/input[@name='csrf_token']").not_nil!["value"]
    fields = {"username" => "GateSignup", "password" => password, "password_confirmation" => password, "csrf_token" => signup_csrf}
    registered = required_login_response("POST", "/signup", body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded", cookies: "AUTH_CSRF=#{signup.cookies["AUTH_CSRF"].value}")
    check(registered.status_code == 302 && required_login_response("GET", "/watch", registered.cookies["SID"].value).status_code == 200, "Permitted signup did not grant account access")
    check(required_login_response("POST", "/api/v1/mobile/register", body: {username: "GateNativeSignup", password: password, passwordConfirmation: password}.to_json).status_code == 200, "Required login blocks permitted native signup")
    discovery = JSON.parse(required_login_response("GET", "/api/v1/mobile/registration").body)
    check(discovery["loginRequired"].as_bool && discovery["registrationEnabled"].as_bool, "Native discovery lost access settings")
    CONFIG.registration_enabled = false
    {"GET", "POST"}.each do |method|
      check(required_login_response(method, "/signup").status_code == 403, "Whitelist mode permits web signup")
    end
    check(!required_login_response("GET", "/login").body.includes?("/signup?"), "Whitelist mode advertises signup")
    check(required_login_response("POST", "/api/v1/mobile/register", body: "{}").status_code == 403, "Whitelist mode permits mobile signup")
    check(!JSON.parse(required_login_response("GET", "/api/v1/mobile/registration").body)["registrationEnabled"].as_bool, "Whitelist mode advertises mobile signup")
    check(required_login_response("POST", "/api/v1/mobile/login", body: {username: user.username, password: password}.to_json).status_code == 200, "Whitelist mode prevents existing account sign-in")

    check(required_login_response("GET", "/feed/private?token=#{user.token}").status_code == 200, "Valid private feed token was blocked")
    check(required_login_response("GET", "/feed/private?token=invalid").status_code == 403, "Invalid private feed token was accepted")
    time = Time.utc.to_unix.to_s
    nonce = "gate-test-nonce"
    signature = OpenSSL::HMAC.hexdigest(:sha1, HMAC_KEY, "#{time}:#{nonce}")
    webhook = "/feed/webhook/v1:#{time}:#{nonce}:#{signature}?#{URI::Params.encode({"hub.mode" => "subscribe", "hub.topic" => "https://www.youtube.com/feeds/videos.xml?channel_id=UCtest", "hub.challenge" => "signed-challenge"})}"
    check(required_login_response("GET", webhook).body == "signed-challenge", "Signed subscription webhook was blocked")
    check(required_login_response("GET", webhook.sub(signature, "invalid")).status_code == 400, "Invalid webhook signature was accepted")
    delivery = %(<feed xmlns="http://www.w3.org/2005/Atom"></feed>)
    delivery_signature = OpenSSL::HMAC.hexdigest(:sha1, HMAC_KEY, delivery)
    check(required_login_response("POST", webhook, body: delivery, extra_headers: {"X-Hub-Signature" => "sha1=#{delivery_signature}"}).status_code == 200, "Signed webhook delivery was blocked")
    check(required_login_response("GET", "/api/v1/verification").status_code == 200, "Bot verification discovery was blocked")
    pairing = required_login_response("POST", "/api/v1/tv/pairing/start", body: "{}")
    check(pairing.status_code == 200 && JSON.parse(pairing.body)["deviceCode"].as_s.size > 0, "TV pairing bootstrap was blocked")

    # Admin saves must never write the user's real config/config.yml.
    FileUtils.mkdir_p(File.join(temporary, "config"))
    CONFIG.admins = [user.username]
    admin_form = required_login_response("GET", "/preferences", sid)
    check(admin_form.body.includes?(%(<input name="login_required")) && admin_form.body.includes?("user whitelist mode"), "Admin settings omit access controls")
    nonadmin = Invidious::Database::Accounts.authenticate("GateBob", password).not_nil!
    check(!required_login_response("GET", "/preferences", nonadmin).body.includes?(%(<input name="login_required")), "Non-admin sees instance access controls")
    admin_csrf = generate_response(sid, {"POST:preferences"}, HMAC_KEY)
    nonadmin_csrf = generate_response(nonadmin, {"POST:preferences"}, HMAC_KEY)
    Dir.cd(temporary) do
      check(required_login_response("POST", "/preferences", sid, body: "login_required=off", content_type: "application/x-www-form-urlencoded").status_code == 403, "Admin save bypassed CSRF")
      fields = {"login_required" => "off", "csrf_token" => nonadmin_csrf}
      required_login_response("POST", "/preferences", nonadmin, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
      check(CONFIG.login_required && !File.exists?("config/config.yml"), "Non-admin changed or persisted instance settings")
      fields = {"login_required" => "on", "csrf_token" => admin_csrf}
      required_login_response("POST", "/preferences", sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
      persisted = Config.from_yaml(File.read("config/config.yml"))
      check(persisted.login_required && persisted.login_enabled && !persisted.registration_enabled, "Admin save lost access settings or disabled sign-in")
      fields = {"login_enabled" => "on", "registration_enabled" => "on", "csrf_token" => admin_csrf}
      required_login_response("POST", "/preferences", sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
      check(!CONFIG.login_required && CONFIG.registration_enabled, "Admin cannot disable required login or reopen signup")
    end
    puts "Required-login coverage, browser/native credentials, scope/CSRF isolation, bootstrap, whitelist, signed feeds and admin persistence passed"
  ensure
    restored = Config.from_yaml(original)
    CONFIG.login_required = restored.login_required
    CONFIG.login_enabled = restored.login_enabled
    CONFIG.registration_enabled = restored.registration_enabled
    CONFIG.captcha_enabled = restored.captcha_enabled
    CONFIG.popular_enabled = restored.popular_enabled
    CONFIG.statistics_enabled = restored.statistics_enabled
    CONFIG.admins = restored.admins
    CONFIG.default_user_preferences = restored.default_user_preferences
    CONFIG.modified_source_code_url = restored.modified_source_code_url
    FileUtils.rm_rf(temporary)
  end
end

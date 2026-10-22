# Integration tests using production account services, routes, and templates.
# Requires an empty disposable PostgreSQL database; never contacts YouTube.
require "digest/md5"
require "file_utils"

# Require kemal, then our own overrides
require "kemal"
require "../../src/ext/kemal_static_file_handler.cr"

require "http_proxy"
require "athena-negotiation"
require "openssl/hmac"
require "option_parser"
require "sqlite3"
require "xml"
require "yaml"
require "compress/zip"
require "protodec/utils"

require "../../src/invidious/database/*"
require "../../src/invidious/database/migrations/*"
require "../../src/invidious/http_server/*"
require "../../src/invidious/helpers/*"
require "../../src/invidious/yt_backend/*"
require "../../src/invidious/frontend/*"
require "../../src/invidious/videos/*"

require "../../src/invidious/jsonify/**"

require "../../src/invidious/*"
require "../../src/invidious/comments/*"
require "../../src/invidious/channels/*"
require "../../src/invidious/user/*"
require "../../src/invidious/search/*"
require "../../src/invidious/routes/**"
require "../../src/invidious/jobs/base_job"
require "../../src/invidious/jobs/*"

# Declare the base namespace for invidious
module Invidious
end

# Simple alias to make code easier to read
alias IV = Invidious

include Invidious

add_context_storage_type(Array(String))
add_context_storage_type(Preferences)
add_context_storage_type(Invidious::User)

NOTIFICATION_CHANNEL = ::Channel(VideoNotification).new(32)
CONFIG               = Config.from_yaml(<<-YAML)
  hmac_key: turnstile-integration-test-key-at-least-32-characters
  domain: invidious.test
  https_only: true
  external_port: 443
  turnstile_site_key: test-public-key
  turnstile_secret_key: test-secret-key
  turnstile_allowed_hostnames: [invidious.test]
  turnstile_companion_private: true
  invidious_companion:
    - private_url: http://127.0.0.1:1
  YAML
CONFIG.invidious_companion.each do |companion|
  companion.builtin_proxy = true
  companion.public_url = URI.parse("/companion")
end
HMAC_KEY           = CONFIG.hmac_key
BOT_TEST_URL       = ENV["BOT_PROTECTION_TEST_DATABASE_URL"]
abort "A disposable invidious_bot_protection_test database is required" unless URI.parse(BOT_TEST_URL).path == "/invidious_bot_protection_test"
PG_DB = DB.open(BOT_TEST_URL)
HOST_URL = "https://invidious.test"
MAX_ITEMS_PER_PAGE = 1500
CURRENT_BRANCH = "fixture"
CURRENT_COMMIT = "fixture"
CURRENT_VERSION = "fixture"
CURRENT_TAG = ""
ASSET_COMMIT = "fixture"
SOFTWARE = {"version" => "fixture", "branch" => "fixture"}
OUTPUT = File.open(File::NULL, "w")
LOGGER = Invidious::LogHandler.new(OUTPUT, LogLevel::Off)
YT_POOL = YoutubeConnectionPool.new(URI.parse("https://www.youtube.com"), capacity: 1)
GGPHT_POOL = YoutubeConnectionPool.new(URI.parse("https://yt3.ggpht.com"), capacity: 1)
COMPANION_POOL = CompanionConnectionPool.new(capacity: 1)

alias Protection = Invidious::BotProtection

def check(value, message)
  raise message unless value
end

def must_fail(message, &)
  failed = false
  begin
    yield
  rescue
    failed = true
  end
  check(failed, message)
end

# Test all routing with the real middleware. A terminal sentinel represents any
# expensive handler; hitting it while blocked would constitute an upstream call.
class BotTestEndpoint
  include HTTP::Handler
  class_property upstream_calls = 0
  class_property provider_calls = 0

  def call(context)
    env = context
    Invidious::Routes::BeforeAll.handle(env)
    result = case env.request.path
             when "/api/v1/verification"
               Invidious::Routes::Verification.status(env)
             when "/api/v1/verification/complete"
               mock = Protection::Siteverify.new(->(body : String) {
                 self.class.provider_calls += 1
                 token = URI::Params.parse(body)["response"]
                 case token
                 when "outage"                          then HTTP::Client::Response.new(503)
                 when "malformed"                       then HTTP::Client::Response.new(200, body: "{}")
                 when "wrong-host"                      then HTTP::Client::Response.new(200, body: {success: true, hostname: "evil.test", action: Protection::ACTION}.to_json)
                 when "wrong-action"                    then HTTP::Client::Response.new(200, body: {success: true, hostname: "invidious.test", action: "registration"}.to_json)
                 when "expired", "duplicate", "invalid" then HTTP::Client::Response.new(200, body: {success: false, "error-codes": ["timeout-or-duplicate"]}.to_json)
                 else                                        HTTP::Client::Response.new(200, body: {success: true, hostname: "invidious.test", action: Protection::ACTION}.to_json)
                 end
               })
               Invidious::Routes::Verification.complete(env, mock)
             when "/verify"
               Invidious::Routes::Verification.page(env)
             when "/admin/bot-protection"
               Invidious::Routes::Verification.admin(env)
             when "/login"
               Invidious::Routes::Login.login_page(env)
             else
               self.class.upstream_calls += 1
               check(!env.request.headers.has_key?(Protection::HEADER), "Verification header forwarded upstream")
               check(!env.request.headers["Cookie"]?.try(&.includes?("IV_VERIFIED=")), "Verification cookie forwarded upstream")
               env.response.headers["X-Test-Authorization"] = env.request.headers["Authorization"]? || "none"
               if env.request.headers.has_key?("Range")
                 env.response.status_code = 206
                 env.response.headers["Content-Range"] = "bytes 0-3/4"
                 env.response.headers["Cache-Control"] = "public, max-age=86400"
               end
               "upstream"
             end
    env.response.print(result) if result.is_a?(String)
  end
end

# A second process checks persisted policy without clearing the guarded database.
if ARGV.includes?("--read-policy")
  policy = Protection.settings
  puts({enabled: policy.enabled, duration: policy.duration_hours, revision: policy.revision}.to_json)
  PG_DB.close
  exit
end

PG_DB.exec("DROP SCHEMA public CASCADE")
PG_DB.exec("CREATE SCHEMA public")
PG_DB.using_connection do |conn|
  %w[users session_ids nonces auth_rate_limits].each { |name| conn.as(PG::Connection).exec_all(File.read("config/sql/#{name}.sql")) }
end
# Exercise the production migration and idempotent fresh-install schema separately.
PG_DB.exec("CREATE TABLE IF NOT EXISTS invidious_migrations (version bigint PRIMARY KEY)")
migration = Invidious::Database::Migrations::BotProtection.new(PG_DB)
migration.migrate
PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/bot_protection_settings.sql")) }
check(PG_DB.query_one("SELECT count(*) FROM bot_protection_settings", as: Int64) == 1, "Settings are not singleton/idempotent")
check(!Protection.settings.enabled && Protection.settings.duration_hours == 12, "Unsafe install defaults")
check(Protection.readiness.empty?, "Fixture configuration not ready: #{Protection.readiness}")

server = HTTP::Server.new([Invidious::HttpServer::RequiredLoginHandler.new, Invidious::HttpServer::BotProtectionHandler.new, BotTestEndpoint.new])
address = server.bind_tcp("127.0.0.1", 0)
spawn { server.listen }
base = "http://127.0.0.1:#{address.port}"

def request(base, path, method = "GET", token : String? = nil, body : String? = nil, headers = HTTP::Headers.new)
  headers[Protection::HEADER] = token if token
  HTTP::Client.exec(method, base + path, headers, body)
end

def complete(base, token = "success", transport = "native", origin = "https://invidious.test")
  request(base, "/api/v1/verification/complete", "POST", body: {turnstileToken: token, transport: transport, returnUrl: "/watch?v=test&t=31"}.to_json,
    headers: HTTP::Headers{"Content-Type" => "application/json", "Origin" => origin})
end

begin
  check(request(base, "/watch").status_code == 200, "Disabled gate blocked content")
  policy = Protection.save(true, 12)
  count = BotTestEndpoint.upstream_calls
  paths = %w[/ /watch?v=test /watch/test /w/test /v/test /e/test /shorts/test /live/test /clip/test /embed/test /search?q=test /results /channel/UCtest /playlist?list=PLtest /feed/channel/UCtest /feed/private?token=secret /api/v1/videos/test /api/v1/captions/test /api/v1/auth/preferences /api/manifest/dash/id/test /api/manifest/dash/id/videoplayback /api/manifest/hls_playlist/test /videoplayback /videoplayback/id/test /latest_version /download /companion /companion/ /companion/videoplayback /vi/test/hqdefault.jpg /sb/test/storyboard3_L0/0.jpg /s_p/test/a /yts/img/a /ggpht/test /pl_c/test/a /tvfilm_banner/test/a /new-route]
  paths.each do |path|
    {"GET", "HEAD"}.each do |method|
      blocked = request(base, path, method)
      check(blocked.status_code == 403, "Gate bypass for #{method} #{path}: #{blocked.status_code}")
      check(blocked.headers["X-Invidious-Verification-Required"]? == "verification_required", "Missing stable header")
    end
  end
  check(BotTestEndpoint.upstream_calls == count, "A blocked route contacted upstream")
  navigation = request(base, "/watch?v=test&t=32", headers: HTTP::Headers{"Accept" => "text/html"})
  check(navigation.status_code == 303 && navigation.headers["Location"].includes?("return=%2Fwatch%3Fv%3Dtest%26t%3D32"), "Navigation loses destination")
  media = request(base, "/companion/videoplayback", headers: HTTP::Headers{"Accept" => "text/html", "Range" => "bytes=0-3"})
  check(media.status_code == 403 && media.headers["Content-Type"].starts_with?("application/json"), "Media got HTML challenge")
  check(request(base, "/embed/test").body.includes?("Open this instance"), "Embed recovery link missing")
  preflight = request(base, "/companion/videoplayback", "OPTIONS")
  check(preflight.status_code == 204 && preflight.headers["Access-Control-Allow-Headers"].includes?(Protection::HEADER), "Native preflight blocked")
  check(BotTestEndpoint.upstream_calls == count, "Preflight contacted Companion")

  status = JSON.parse(request(base, "/api/v1/verification").body)
  check(status["required"].as_bool && status["siteKey"] == CONFIG.turnstile_site_key && !status.to_json.includes?(CONFIG.turnstile_secret_key), "Invalid bootstrap")
  page = request(base, "/verify?client=native&return=%2Fwatch%3Fv%3Dtest")
  check(page.status_code == 200 && page.body.includes?("verification-config") && page.headers["Content-Security-Policy"].includes?("challenges.cloudflare.com"), "Native hosted page unavailable")
  check(!request(base, "/admin/bot-protection").headers["Content-Security-Policy"].includes?("challenges.cloudflare.com"), "CSP relaxed outside verification")
  %w[https://evil.test //evil.test /\evil.test /%2fevil.test /%252fevil.test /foo%0d%0aLocation:evil /verify /api/v1/verification].each do |unsafe|
    check(Protection.safe_return(unsafe) == "/", "Unsafe redirect accepted: #{unsafe}")
  end
  check(Protection.safe_return("/watch?v=test&t=99#clip") == "/watch?v=test&t=99#clip", "Safe local return rejected")

  %w[expired duplicate invalid wrong-host wrong-action].each do |token|
    response = complete(base, token)
    check(response.status_code == 403 && JSON.parse(response.body)["error"] == "verification_failed", "Invalid challenge accepted: #{token}")
  end
  outage = complete(base, "outage")
  check(outage.status_code == 503 && JSON.parse(outage.body)["error"] == "verification_unavailable", "Outage failed open")
  check(complete(base, "malformed").status_code == 503, "Malformed provider response was not treated as unavailable")
  check(complete(base, "success", "browser", "https://evil.test").status_code == 403, "Cross-origin cookie completion accepted")
  check(request(base, "/api/v1/verification/complete", "POST", body: "x" * 8193).status_code == 400, "Unbounded completion body")
  response = complete(base)
  check(response.status_code == 200 && !response.headers.has_key?("Set-Cookie"), "Native transport issued a cookie")
  pass = JSON.parse(response.body)["verificationToken"].as_s
  expiry = JSON.parse(response.body)["expiresAt"].as_i64
  check(Protection.validate(pass, policy) == expiry, "Issued pass invalid")
  check(Protection.validate(pass + "forged", policy) == "verification_required", "Forged pass accepted")
  check(Protection.validate(pass, policy, now: expiry) == "verification_expired", "Expired pass accepted")
  check(Protection.validate(pass, policy, now: Time.utc.to_unix - 1) == "verification_required", "Future issued pass accepted")
  check(Protection.validate(pass, Protection::Settings.new(true, 12, policy.revision + 1)) == "verification_required", "Obsolete policy pass accepted")
  now = Time.utc.to_unix
  wrong_audience = Base64.urlsafe_encode({v: 1, purpose: Protection::PURPOSE, id: "a" * 32, aud: "https://other.test", iat: now, exp: now + 43200, revision: policy.revision}.to_json, padding: false)
  key = OpenSSL::HMAC.digest(:sha256, HMAC_KEY, Protection::PURPOSE)
  signed_wrong_audience = wrong_audience + "." + Base64.urlsafe_encode(OpenSSL::HMAC.digest(:sha256, key, wrong_audience), padding: false)
  check(Protection.validate(signed_wrong_audience, policy) == "verification_required", "Another instance's pass accepted")
  expired = Protection.issue(policy, now: now - 43201).token
  check(JSON.parse(request(base, "/api/v1/videos/test", token: expired).body)["error"] == "verification_expired", "Expiry error unstable")
  paths.each { |path| check(request(base, path, token: pass).status_code == 200, "Valid native pass failed on #{path}") }
  # An instance pass is intentionally replayable until expiry (not the single-use CF token).
  check(request(base, "/watch", token: pass).status_code == 200, "Reusable instance pass failed")
  range = request(base, "/companion/videoplayback", token: pass, headers: HTTP::Headers{"Range" => "bytes=0-3", "Authorization" => "Bearer account-token", "Cookie" => "IV_VERIFIED=#{pass}; PREFS=other"})
  check(range.status_code == 206 && range.headers["Content-Range"] == "bytes 0-3/4" && range.headers["X-Test-Authorization"] == "Bearer account-token", "Range/account auth altered")
  check(range.headers["Cache-Control"] == "private, no-store", "Upstream cache policy exposed protected content")
  check(request(base, "/watch", headers: HTTP::Headers{"Cookie" => "IV_VERIFIED=#{pass}"}).status_code == 200, "Cookie pass failed")
  cookie_response = complete(base, transport: "browser")
  cookie = cookie_response.cookies[Protection::COOKIE]
  check(cookie.secure && cookie.http_only && cookie.samesite == HTTP::Cookie::SameSite::Lax && cookie.domain.nil? && cookie.path == "/", "Unsafe browser cookie")
  check(!cookie_response.body.includes?("verificationToken"), "Browser completion exposes cookie credential")
  check(request(base, "/watch", token: pass).status_code == 200, "Existing pass invalidated by outage")

  # Cloudflare owns challenge replay prevention; exercise its single-use result.
  spent = false
  single_use = Protection::Siteverify.new(->(_body : String) {
    response = HTTP::Client::Response.new(200, body: {success: !spent, hostname: "invidious.test", action: Protection::ACTION}.to_json)
    spent = true
    response
  })
  single_use.validate("single-use-challenge")
  must_fail("Replayed challenge accepted") { single_use.validate("single-use-challenge") }
  internal_error = Protection::Siteverify.new(->(_body : String) {
    HTTP::Client::Response.new(200, body: {success: false, "error-codes": ["internal-error"]}.to_json)
  })
  must_fail("Provider internal error accepted") { internal_error.validate("challenge") }
  # The timeout includes connect, response and body, and closes the client.
  slow = Protection::Siteverify.new(->(_body : String) { sleep 9.seconds; HTTP::Client::Response.new(200) })
  elapsed = Time.measure { must_fail("Provider has no overall deadline") { slow.validate("challenge") } }
  check(elapsed < 8.5.seconds, "Siteverify exceeded its bounded deadline")
  %w[/privacy /licenses /api/v1/stats /js/verification.js /css/verification.css /login /signup /api/v1/mobile/registration /feed/webhook/invalid-signature].each do |path|
    check(Invidious::HttpServer::BotProtectionHandler.exempt?(HTTP::Request.new("GET", path)), "Missing explicit exception: #{path}")
  end
  check(!Invidious::HttpServer::BotProtectionHandler.exempt?(HTTP::Request.new("GET", "/vi/id/verification.js")), "Static extension bypass")
  check(!Invidious::HttpServer::BotProtectionHandler.exempt?(HTTP::Request.new("POST", "/js/verification.js")), "Static method bypass")
  embedded_alias = request(base, "/e/test", headers: HTTP::Headers{"Sec-Fetch-Dest" => "iframe"})
  check(embedded_alias.status_code == 403 && embedded_alias.body.includes?("Open this instance"), "Embed alias lacks recovery link")

  CONFIG.admins = ["wingress"]
  # Seed exact account rows without generating channel feeds or calling YouTube.
  %w[wingress outsider].each do |name|
    PG_DB.exec("INSERT INTO users (updated, notifications, subscriptions, email, preferences, password, token, watched, feed_needs_update, username, credential_version) VALUES (now(), '{}', '{}', $1, '{}', 'unused', $1, '{}', false, $2, 1)", "account:#{name}", name)
    PG_DB.exec("INSERT INTO session_ids (id, email, issued, expires_at) VALUES ($1, $2, now(), now() + interval '1 day')", "sid-#{name}", "account:#{name}")
  end
  check(request(base, "/watch", headers: HTTP::Headers{"Cookie" => "SID=sid-wingress"}).status_code == 403, "Signed-in administrator bypassed gate")
  check(request(base, "/admin/bot-protection", headers: HTTP::Headers{"Cookie" => "SID=sid-outsider"}).status_code == 403, "Non-admin got recovery controls")
  admin = request(base, "/admin/bot-protection", headers: HTTP::Headers{"Cookie" => "SID=sid-wingress"})
  check(admin.status_code == 200 && admin.body.includes?("Bot protection"), "Administrator recovery blocked")
  csrf = HTML.unescape(admin.body.match(/name="csrf_token" value="([^"]+)"/).not_nil![1])
  admin_headers = HTTP::Headers{"Cookie" => "SID=sid-wingress", "Content-Type" => "application/x-www-form-urlencoded"}
  check(request(base, "/admin/bot-protection", "POST", body: "duration_hours=1", headers: admin_headers).status_code == 403, "Missing CSRF accepted")
  changed = request(base, "/admin/bot-protection", "POST", body: URI::Params.encode({"duration_hours" => "1", "csrf_token" => csrf}), headers: admin_headers)
  check(changed.status_code == 200 && !Protection.settings.enabled && Protection.settings.duration_hours == 1, "Recovery disable failed")
  check(request(base, "/watch").status_code == 200, "Disable not immediate")
  check(!PG_DB.query_one("SELECT enabled FROM bot_protection_settings", as: Bool), "Settings did not persist")
  enabled = Protection.save(true, 12)
  check(enabled.revision > policy.revision && request(base, "/watch", token: pass).status_code == 403, "Re-enable restored revoked pass")
  CONFIG.turnstile_secret_key = ""
  must_fail("Enabled incomplete configuration") { Protection.save(true, 24) }
  check(request(base, "/watch", token: Protection.issue(enabled).token).status_code == 200, "Valid pass needed provider configuration")
  Protection.save(false, 12)
  check(!Protection.settings.enabled, "Outage recovery required a provider secret")
  CONFIG.turnstile_secret_key = "test-secret-key"
  CONFIG.turnstile_signing_key = "independent-verification-signing-key-for-tests"
  separate = Protection.issue(Protection.settings)
  check(Protection.validate(separate.token, Protection.settings).is_a?(Int64), "Independent pass signing key failed")
  CONFIG.turnstile_signing_key = ""
  check(Protection.validate(separate.token, Protection.settings) == "verification_required", "Instance account key validated an independently signed pass")
  CONFIG.turnstile_companion_private = false
  must_fail("Enabled publicly exposed Companion") { Protection.save(true, 12) }
  CONFIG.turnstile_companion_private = true
  CONFIG.https_only = false
  must_fail("Enabled insecure HTTP") { Protection.save(true, 12) }
  CONFIG.https_only = true
  # Simulate another process updating the durable row; this process sees it in <=1s.
  PG_DB.exec("UPDATE bot_protection_settings SET enabled = true, revision = revision + 1")
  sleep 1.05.seconds
  check(Protection.settings.enabled, "Settings cache exceeded one second")
  CONFIG.login_required = true
  login_redirect = request(base, "/watch")
  check(login_redirect.status_code == 303 && login_redirect.headers["Location"].starts_with?("/login?"), "Bot challenge ran before required login")
  denied_api = request(base, "/api/v1/videos/test")
  check(denied_api.status_code == 401 && JSON.parse(denied_api.body)["error"] == "login_required", "Bot challenge replaced API login failure")
  check(request(base, "/login").status_code == 200, "Combined gates blocked login")
  check(request(base, "/api/v1/verification").status_code == 200, "Combined gates blocked verification bootstrap")
  recovery = request(base, "/admin/bot-protection", headers: HTTP::Headers{"Cookie" => "SID=sid-wingress"})
  check(recovery.status_code == 200, "Required login prevented signed-in administrator bot recovery")
  check(request(base, "/watch", token: Protection.issue(Protection.settings).token).status_code == 303, "Bot pass bypassed account login")
  CONFIG.login_required = false
  PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/bot_protection_settings.sql")) }
  restarted = IO::Memory.new
  result = Process.run(PROGRAM_NAME, ["--read-policy"], output: restarted)
  persisted = JSON.parse(restarted.to_s)
  check(result.success? && persisted["enabled"].as_bool && persisted["revision"].as_i64 == Protection.settings.revision, "Fresh-install SQL or process restart reset saved policy")
  puts "Bot protection: migration, route families/HEAD/ranges, credentials, provider failures, admin CSRF/recovery and persistence passed#{{% if flag?(:api_only) %} " (API-only)" {% else %} "" {% end %}}."
ensure
  server.close
  PG_DB.close
end

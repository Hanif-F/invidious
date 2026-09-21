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
CONFIG               = Config.from_yaml("hmac_key: frontend-fixtures\n")
HMAC_KEY             = "frontend-fixtures"
ACCOUNT_TEST_URL     = ENV["ACCOUNT_TEST_DATABASE_URL"]
abort "A disposable invidious_accounts_test database is required" unless URI.parse(ACCOUNT_TEST_URL).path == "/invidious_accounts_test"
PG_DB = DB.open(ACCOUNT_TEST_URL)
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

def check(value, message)
  raise message unless value
end

def context(method = "GET", path = "/login", fields = {} of String => String, cookies = "")
  request = HTTP::Request.new(method, path, HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded", "Cookie" => cookies}, URI::Params.encode(fields))
  env = HTTP::Server::Context.new(request, HTTP::Server::Response.new(IO::Memory.new))
  env.set "preferences", Preferences.from_json("{}")
  env.set "current_page", path
  env
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

begin
  check(PG_DB.query_one("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'", as: Int64) == 0, "Test database must be empty")
  PG_DB.exec("CREATE TABLE invidious_migrations (id bigserial PRIMARY KEY, version bigint NOT NULL)")
  Invidious::Database::Migrator.migrations.map(&.new(PG_DB)).sort_by(&.version).each do |migration|
    migration.migrate if migration.version < 17
  end
  legacy_hash = Crypto::Bcrypt::Password.create("old", cost: 4).to_s
  PG_DB.exec("INSERT INTO users VALUES (now(), ARRAY['notice'], ARRAY['UCtest'], 'Legacy Name!', '{}', $1, 'legacy-token', ARRAY['video'], true)", legacy_hash)
  PG_DB.exec("INSERT INTO session_ids VALUES ('old-browser', 'Legacy Name!', now() - interval '1 year'), ('v1:old-api', 'Legacy Name!', now() - interval '1 year')")
  PG_DB.exec("INSERT INTO watch_history (email, video_id, title, latest_watched) VALUES ('Legacy Name!', 'video', 'Preserved', CURRENT_DATE)")
  PG_DB.exec("INSERT INTO playback_positions (email, video_id, position_seconds) VALUES ('Legacy Name!', 'video', 42)")
  PG_DB.exec("INSERT INTO blocked_channels (email, ucid, name) VALUES ('Legacy Name!', 'UCblocked', 'Blocked')")
  PG_DB.exec("INSERT INTO dearrow_identities VALUES ('Legacy Name!', 'encrypted-preserved')")
  PG_DB.exec("INSERT INTO playlists (id, author, title) VALUES ('IVtest', 'Legacy Name!', 'Saved playlist')")
  PG_DB.exec("CREATE MATERIALIZED VIEW subscriptions_#{sha256("Legacy Name!")} AS #{MATERIALIZED_VIEW_SQL.call("Legacy Name!")}")
  linked = %w(watch_history playback_positions blocked_channels dearrow_identities playlists)
  snapshots = linked.to_h { |table| {table, PG_DB.query_one("SELECT json_agg(t)::text FROM #{table} t", as: String)} }
  migration = Invidious::Database::Migrator.new(PG_DB)
  migration.migrate
  migration.migrate
  user = Invidious::Database::Users.select!(email: "Legacy Name!")
  check(user.username == user.email && user.password == legacy_hash && user.credential_version == 1, "Legacy identity and password changed")
  check(user.watched == ["video"] && user.subscriptions == ["UCtest"] && user.notifications == ["notice"], "Legacy account arrays changed")
  check(Invidious::Database::SessionIDs.select_email("old-browser") == user.email, "Legacy browser did not receive grace period")
  check(Invidious::Database::SessionIDs.select_email("v1:old-api") == user.email, "Legacy API token expired")
  store = Invidious::Database::Accounts
  check(store.authenticate("legacy name!", "old") != nil, "Legacy login failed")
  check(store.authenticate("missing", "wrong").nil?, "Unknown login succeeded")
  sid = store.change(user.email, "old-browser", "old", username: "Renamed").not_nil!
  check(Invidious::Database::SessionIDs.select_email("old-browser").nil?, "Old browser survived rename")
  check(Invidious::Database::SessionIDs.select_email("v1:old-api").nil?, "API token survived rename")
  check(store.authenticate("Legacy Name!", "old").nil?, "Old name still authenticates")
  check(store.authenticate("RENAMED", "old") != nil, "New name failed")
  linked.each { |table| check(snapshots[table] == PG_DB.query_one("SELECT json_agg(t)::text FROM #{table} t", as: String), "Rename changed #{table}") }
  check(Invidious::Database::Users.display_name(user.email) == "Renamed", "Display name did not update")
  check(PG_DB.query_one("SELECT count(*) FROM subscriptions_#{sha256(user.email)}", as: Int64) == 0, "Subscription view disappeared")
  new_password = "a memorable password for this account"
  sid = store.change(user.email, sid, "old", new_password: new_password).not_nil!
  check(store.authenticate("Renamed", "old").nil?, "Old password still works")
  check(store.authenticate("Renamed", new_password) != nil, "New password failed")
  check(store.change(user.email, sid, "wrong", username: "Stolen").nil?, "Incorrect password changed username")
  # Two requests competing for the same case-insensitive username.
  outcomes = Channel(Bool).new(2)
  %w(Racing racing).each do |name|
    spawn do
      begin
        store.register(name, new_password, Preferences.from_json("{}"))
        outcomes.send(true)
      rescue ex : PQ::PQError
        raise ex unless ex.field_message(:code) == "23505"
        outcomes.send(false)
      end
    end
  end
  check(Array.new(2) { outcomes.receive }.count(true) == 1, "Concurrent duplicate signup was not rejected")
  # Simulated feed-creation failure must roll back the user and session too.
  PG_DB.exec("ALTER TABLE channel_videos RENAME TO channel_videos_test_hidden")
  must_fail("Signup should fail when feed creation fails") { store.register("Rollback", new_password, Preferences.from_json("{}")) }
  PG_DB.exec("ALTER TABLE channel_videos_test_hidden RENAME TO channel_videos")
  check(PG_DB.query_one("SELECT count(*) FROM users WHERE username = 'Rollback'", as: Int64) == 0, "Failed signup left an account")
  # A credential change and an old-password login serialize on the same user row.
  raced = Channel(String?).new(2)
  spawn { raced.send(store.authenticate("Renamed", new_password)) }
  spawn { raced.send(store.change(user.email, sid, new_password, new_password: "the next strong account password")) }
  race_results = Array.new(2) { raced.receive }
  check(race_results.compact.count { |value| Invidious::Database::SessionIDs.select_email(value) != nil } == 1, "Concurrent old-password login survived change")
  new_password = "the next strong account password"
  sid = race_results.compact.find { |value| Invidious::Database::SessionIDs.select_email(value) != nil }.not_nil!
  must_fail("Revoked parent minted a new API token") { generate_token(user.email, [":*"], nil, HMAC_KEY, "old-browser") }
  api = JSON.parse(generate_token(user.email, [":*"], nil, HMAC_KEY, sid))["session"].as_s
  check(Invidious::Database::SessionIDs.select_email(api) == user.email, "API token creation failed")
  # Expiry is server-enforced for both web and API cookie authentication.
  PG_DB.exec("UPDATE session_ids SET expires_at = now() - interval '1 second' WHERE id = $1", sid)
  check(Invidious::Database::SessionIDs.select_email(sid).nil?, "Expired browser remains valid")
  check(store.change(user.email, sid, new_password, username: "Expired").nil?, "Expired session changed credentials")
  # Atomic shared throttling.
  throttle_results = Channel(Bool).new(12)
  12.times { spawn { throttle_results.send(!store.throttle("parallel-test", 10, 900).nil?) } }
  check(Array.new(12) { throttle_results.receive }.count(true) == 2, "Throttle limit failed under concurrency")
  PG_DB.exec("UPDATE auth_rate_limits SET expires_at = now() - interval '1 second'")
  check(store.throttle("parallel-test", 10, 900).nil?, "Throttle never unlocks")
  # CSRF cookie binding, scope, expiry and nonce consumption use production validators.
  get = context
  token = Invidious::Authentication.form_token(get, "login")
  cookie = get.response.cookies["AUTH_CSRF"].value
  post = context("POST", "/login", {"csrf_token" => token}, "AUTH_CSRF=#{cookie}")
  Invidious::Authentication.validate_form(post)
  must_fail("Missing binding accepted") { Invidious::Authentication.validate_form(context("POST", "/login", {"csrf_token" => token})) }
  must_fail("Wrong scope accepted") { Invidious::Authentication.validate_form(context("POST", "/signup", {"csrf_token" => token}, "AUTH_CSRF=#{cookie}")) }
  expired = generate_response(cookie, {"POST:login"}, HMAC_KEY, -1.second)
  must_fail("Expired form accepted") { validate_request(expired, cookie, post.request, HMAC_KEY) }
  nonce = generate_response(cookie, {"POST:login"}, HMAC_KEY, use_nonce: true)
  validate_request(nonce, cookie, post.request, HMAC_KEY)
  must_fail("Reused nonce accepted") { validate_request(nonce, cookie, post.request, HMAC_KEY) }
  CONFIG.auth_trusted_proxies = ["10.0.0.0/8", "2001:db8::/32"]
  check(Invidious::Authentication.trusted?("10.2.3.4"), "IPv4 proxy CIDR mismatch")
  check(Invidious::Authentication.trusted?("2001:db8::1"), "IPv6 proxy CIDR mismatch")
  check(!Invidious::Authentication.trusted?("192.0.2.1"), "Untrusted proxy accepted")
  peer = context
  peer.request.remote_address = Socket::IPAddress.new("192.0.2.1", 1234)
  peer.request.headers["X-Forwarded-For"] = "203.0.113.2"
  check(Invidious::Authentication.client_ip(peer) == "192.0.2.1", "Untrusted peer spoofed IP")
  peer.request.remote_address = Socket::IPAddress.new("10.0.0.1", 1234)
  peer.request.headers["X-Forwarded-For"] = "198.51.100.9, 203.0.113.2, 10.0.0.2"
  check(Invidious::Authentication.client_ip(peer) == "203.0.113.2", "Proxy walk trusted attacker-supplied leftmost address")
  peer.request.headers["X-Forwarded-For"] = "malformed"
  check(Invidious::Authentication.client_ip(peer) == "10.0.0.1", "Malformed proxy chain accepted")
  PG_DB.exec("TRUNCATE auth_rate_limits")
  10.times { check(!Invidious::Authentication.throttle(context, "limit-user"), "Premature throttle") }
  limited = context
  check(Invidious::Authentication.throttle(limited, "limit-user"), "Authentication attempt limit ignored")
  check(limited.response.status_code == 429 && limited.response.headers["Retry-After"].to_i > 0, "Throttle lacks HTTP retry guidance")
  PG_DB.exec("TRUNCATE auth_rate_limits")
  10.times { check(!Invidious::Authentication.throttle(context, nil, true), "Premature signup throttle") }
  check(Invidious::Authentication.throttle(context, nil, true), "Signup attempt limit ignored")
  PG_DB.exec("TRUNCATE auth_rate_limits")
  CONFIG.https_only = true
  check(!Invidious::User::Cookies.sid("test.i2p", "sid").secure, "I2P exception lost")
  check(Invidious::User::Cookies.sid("test.example", "sid").secure, "I2P disabled HTTPS cookie protection globally")
  CONFIG.captcha_enabled = false
  get = context
  html = Invidious::Routes::Login.login_page(get).not_nil!
  check(html.includes?("autocomplete=\"current-password\"") && !html.includes?("Sign In/Register"), "Login form regression")
  check(get.response.headers["Cache-Control"] == "no-store", "Credential page cached")
  # Signup and login execute distinct production handlers, with no reflected secrets.
  signup_get = context("GET", "/signup")
  signup_token = Invidious::Authentication.form_token(signup_get, "signup")
  signup_cookie = signup_get.response.cookies["AUTH_CSRF"].value
  fields = {"csrf_token" => signup_token, "username" => "RouteUser", "password" => new_password, "password_confirmation" => new_password}
  signup_post = context("POST", "/signup", fields, "AUTH_CSRF=#{signup_cookie}")
  Invidious::Routes::Login.signup(signup_post)
  check(signup_post.response.status_code == 302 && signup_post.response.cookies.has_key?("SID"), "Signup handler did not authenticate")
  check(PG_DB.query_one("SELECT email FROM users WHERE username = 'RouteUser'", as: String).starts_with?("account:"), "New account did not use independent owner ID")
  login_get = context
  login_token = Invidious::Authentication.form_token(login_get, "login")
  login_cookie = login_get.response.cookies["AUTH_CSRF"].value
  bad_post = context("POST", "/login", {"csrf_token" => login_token, "username" => "NeverCreated", "password" => new_password}, "AUTH_CSRF=#{login_cookie}")
  failure_html = Invidious::Routes::Login.login(bad_post).not_nil!
  check(bad_post.response.status_code == 401 && !failure_html.includes?(new_password), "Failed login leaked secret or used wrong status")
  check(PG_DB.query_one("SELECT count(*) FROM users WHERE username = 'NeverCreated'", as: Int64) == 0, "Login silently registered an account")
  account_sid = signup_post.response.cookies["SID"].value
  account_email = Invidious::Database::SessionIDs.select_email(account_sid).not_nil!
  account_user = Invidious::Database::Users.select!(email: account_email)
  account = context("GET", "/account")
  account.set "user", account_user
  account.set "sid", account_sid
  check(Invidious::Routes::Account.get_account(account).not_nil!.includes?("Change username"), "Account page did not render")
  change_token = generate_response(account_sid, {"POST:account/username"}, HMAC_KEY)
  change = context("POST", "/account/username", {"csrf_token" => change_token, "username" => "RouteRenamed", "password" => new_password})
  change.set "user", account_user
  change.set "sid", account_sid
  Invidious::Routes::Account.post_username(change)
  check(change.response.status_code == 302 && Invidious::Database::SessionIDs.select_email(account_sid).nil?, "Rename handler did not rotate session")
  new_sid = change.response.cookies["SID"].value
  check(!store.delete(account_email, new_sid, "wrong"), "Account deletion did not require password")
  check(store.delete(account_email, new_sid, new_password), "Confirmed account deletion failed")
  CONFIG.captcha_enabled = true
  captcha_get = context("GET", "/signup")
  csrf = Invidious::Authentication.form_token(captcha_get, "signup")
  binding = captcha_get.response.cookies["AUTH_CSRF"].value
  answer = OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, "1:05:10")
  captcha_token = generate_response(answer, {"POST:signup"}, HMAC_KEY, use_nonce: true)
  captcha_post = context("POST", "/signup", {"csrf_token" => csrf, "username" => "CaptchaUser", "password" => new_password, "password_confirmation" => new_password, "answer" => "1:05:10", "token[0]" => captcha_token}, "AUTH_CSRF=#{binding}")
  Invidious::Routes::Login.signup(captcha_post)
  check(captcha_post.response.status_code == 302, "Valid signup CAPTCHA rejected")
  must_fail("Reused CAPTCHA accepted") { validate_request(captcha_token, answer, captcha_post.request, HMAC_KEY) }
  incorrect_token = generate_response(answer, {"POST:signup"}, HMAC_KEY, use_nonce: true)
  must_fail("Wrong CAPTCHA answer accepted") { validate_request(incorrect_token, "wrong answer", captcha_post.request, HMAC_KEY) }
  CONFIG.captcha_enabled = false
  CONFIG.registration_enabled = false
  disabled = context("GET", "/signup")
  Invidious::Routes::Login.signup_page(disabled)
  check(disabled.response.status_code == 403, "Registration switch ignored")
  CONFIG.login_enabled = false
  disabled = context
  Invidious::Routes::Login.login_page(disabled)
  check(disabled.response.status_code == 403, "Login switch ignored")
  # Verify migration failure rolls back DDL rather than dropping/merging conflicts.
  PG_DB.exec("DROP SCHEMA public CASCADE")
  PG_DB.exec("CREATE SCHEMA public")
  PG_DB.exec("CREATE TABLE invidious_migrations (id bigserial PRIMARY KEY, version bigint NOT NULL)")
  Invidious::Database::Migrations::CreateUsersTable.new(PG_DB).migrate
  Invidious::Database::Migrations::CreateSessionIdsTable.new(PG_DB).migrate
  PG_DB.exec("DROP INDEX email_unique_idx")
  PG_DB.exec("INSERT INTO users (email) VALUES ('Collision'), ('collision')")
  must_fail("Conflicting names should abort migration") { Invidious::Database::Migrations::SecureAccounts.new(PG_DB).migrate }
  check(PG_DB.query_one("SELECT count(*) FROM users", as: Int64) == 2, "Migration removed a conflicting account")
  check(PG_DB.query_one("SELECT count(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username'", as: Int64) == 0, "Failed migration did not roll back DDL")
  PG_DB.exec("DROP SCHEMA public CASCADE")
  PG_DB.exec("CREATE SCHEMA public")
  %w(users session_ids auth_rate_limits).each do |table|
    PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/#{table}.sql")) }
  end
  store.check_schema
  check(PG_DB.query_one("SELECT count(*) FROM users", as: Int64) == 0, "Fresh schema is not empty")
  puts "Account migration, preservation, transactions, credentials, sessions, throttling, CSRF and forms passed"
ensure
  PG_DB.close
end

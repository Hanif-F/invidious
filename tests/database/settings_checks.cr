# Loaded by the accounts harness, whose URL/name/empty-database guards run first.
# No upstream services, production credentials, or deployed instance are used.
def check_settings_merges
  web = Invidious::WebPreferences
  locales = I18n::LOCALES_LIST.keys
  known = JSON.parse(Preferences.from_json("{}").to_json).as_h.keys
  accounted = Invidious::WebPreferences::SECTIONS.values.flatten + Invidious::WebPreferences::DEDICATED.values.flatten + Invidious::WebPreferences::PRESERVED_ONLY
  check((known - accounted).empty?, "Preference fields lack a category or preservation owner")
  password = "isolated settings merge test password"
  sid = Invidious::Database::Accounts.register("SettingsOwner", password, Preferences.from_json("{}"))
  other_sid = Invidious::Database::Accounts.register("SettingsOther", password, Preferences.from_json("{}"))
  owner = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  other = Invidious::Database::SessionIDs.select_email(other_sid).not_nil!
  other_before = Invidious::Database::Users.preference_json(other)
  original = JSON.parse(Preferences.from_json(%({"dark_mode":"dark","show_nick":true,"ui_density":"compact","thin_mode":true,"player_style":"youtube","save_player_pos":true,"chat_overlay_mode":true,"chat_width_px":520})).to_json).as_h
  original["future_native"] = JSON.parse(%({"preserve":[1,2,3]}))
  original["sponsorblock_modes"].as_h["future-category"] = JSON::Any.new("future-mode")
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", original.to_json, owner)
  PG_DB.exec("INSERT INTO playback_positions (email, video_id, position_seconds) VALUES ($1, 'abcdefghijk', 492)", owner)

  raw = web.save_account(owner, "appearance", URI::Params.parse("dark_mode=light"), locales)
  saved = JSON.parse(raw).as_h
  check(saved["dark_mode"] == "light" && saved["show_nick"] == false, "Appearance canonical save failed")
  original.each do |key, value|
    check(saved[key] == value, "Category save changed unrelated/native data: #{key}") unless Invidious::WebPreferences::SECTIONS["appearance"].includes?(key)
  end
  check(PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE email=$1", owner, as: Int64) == 1, "Appearance save cleared positions")
  check(Invidious::Database::Users.preference_json(other) == other_before, "Category save changed another account")

  before = Invidious::Database::Users.preference_json(owner)
  must_fail("Invalid section accepted") { web.save_account(owner, "administration", URI::Params.parse("login_required=on"), locales) }
  must_fail("Invalid category values accepted") { web.save_account(owner, "playback", URI::Params.parse("speed=1.5&seek_seconds=11"), locales) }
  check(Invidious::Database::Users.preference_json(owner) == before, "Failed validation partially wrote preferences")

  # Hold the first row lock while a different category starts a transaction.
  # The second writer must merge the committed latest document, not a stale form.
  locked = Channel(Nil).new
  release = Channel(Nil).new
  results = Channel(Exception?).new(2)
  spawn do
    begin
      Invidious::Database::Users.merge_preferences(owner) do |_conn, stored|
        locked.send(nil)
        release.receive
        web.apply("appearance", URI::Params.parse("dark_mode=dark&show_nick=on"), stored, locales)
      end
      results.send(nil)
    rescue ex
      results.send(ex)
    end
  end
  locked.receive
  spawn do
    begin
      web.save_account(owner, "playback", URI::Params.parse("speed=1.5&seek_seconds=20&preferred_audio=original_stable"), locales)
      results.send(nil)
    rescue ex
      results.send(ex)
    end
  end
  Fiber.yield
  release.send(nil)
  2.times { check(results.receive.nil?, "Concurrent category save failed") }
  saved = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(saved["dark_mode"] == "dark" && saved["show_nick"] == true && saved["speed"] == 1.5 && saved["seek_seconds"] == 20, "Concurrent unrelated categories lost a committed change")
  check(saved["future_native"] == original["future_native"] && saved["thin_mode"] == true && saved["player_style"] == "youtube", "Concurrent saves lost compatibility fields")
  check(saved["chat_overlay_mode"] == true && saved["chat_width_px"] == 520, "Category save lost dedicated chat state")

  web.save_account(owner, "sponsorblock", URI::Params.parse("sponsorblock_enabled=on&sponsorblock_mode_sponsor=auto"), locales)
  saved = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(saved["sponsorblock_modes"]["future-category"] == "future-mode", "Canonical map save deleted an unknown native category")
  check(saved["sponsorblock_modes"]["sponsor"] == "auto", "SponsorBlock category did not save")

  web.save_account(owner, "language", URI::Params.parse("locale=id&timezone=Asia%2FJakarta&region=ID"), locales)
  web.save_account(owner, "language", URI::Params.parse("timezone=&region="), locales)
  saved = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(saved["locale"] == "id" && saved["timezone"].raw.nil? && saved["region"].raw.nil?, "Nullable category values were not explicitly cleared")
  web.save_account(owner, "library", URI::Params.parse("save_player_pos=on&watch_history=on&max_results=60"), locales)
  check(PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE email=$1", owner, as: Int64) == 1, "Enabled sync cleared positions")
  web.save_account(owner, "library", URI::Params.parse("watch_history=on&max_results=60"), locales)
  check(PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE email=$1", owner, as: Int64) == 0, "Disabling sync failed to clear positions in the transaction")
  check(JSON.parse(Invidious::Database::Users.preference_json(owner))["watch_history"] == true, "Sync opt-out disabled history")
  # Exercise the actual HTML/JSON category handlers through production auth.
  token = Invidious::Helpers::Tokens.generate_response(sid, {"POST:preferences"}, HMAC_KEY)
  fields = {"section" => "appearance", "browser_profile" => Invidious::BrowserProfiles.account_scope(owner), "csrf_token" => token, "dark_mode" => "light", "show_nick" => "on"}
  config_before = CONFIG.to_yaml
  fields["login_required"] = "on"
  fields["admin_default_home"] = "Trending"
  posted = security_request("POST", "/preferences?redirect=false", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  check(posted.response.status_code == 200, "Category JSON POST failed")
  result = JSON.parse(posted.get("test_result").as(String))
  check(result["section"] == "appearance" && result["preferences"]["dark_mode"] == "light" && result["fingerprint"].as_s.size == 64, "Legacy JSON success fields or category values missing")
  check(posted.response.headers["Cache-Control"] == "private, no-store", "Category success was cacheable")
  check(posted.response.cookies["PREFS"]?.nil?, "Account category save wrote the guest cookie")
  check(CONFIG.to_yaml == config_before, "Personal category POST changed instance configuration")
  canonical = security_request("GET", "/preferences?section=appearance&format=json", sid: sid)
  check(JSON.parse(canonical.get("test_result").as(String))["values"] == result["values"], "Canonical category read-back differs from saved values")
  raw_before = Invidious::Database::Users.preference_json(owner)
  fields["browser_profile"] = Invidious::BrowserProfiles.account_scope(other)
  check(security_request("POST", "/preferences?redirect=false", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code == 409, "Stale profile saved as another account")
  fields["browser_profile"] = Invidious::BrowserProfiles.account_scope(owner)
  fields["csrf_token"] = "forged"
  check(security_request("POST", "/preferences?redirect=false", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code == 403, "Category POST bypassed CSRF")
  fields["csrf_token"] = token
  fields["section"] = "unknown"
  check(security_request("POST", "/preferences?redirect=false", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code == 400, "Unknown category wrote settings")
  check(Invidious::Database::Users.preference_json(owner) == raw_before, "Rejected category request mutated account settings")
  fields["section"] = "library"
  fields["max_results"] = "1501"
  failed = security_request("POST", "/preferences", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  html = failed.get("test_result").as(String)
  check(failed.response.status_code == 400 && html.includes?(%(value="1501")) && html.includes?(%(data-category-form)), "HTML validation failure lost the owning draft")
  fields["section"] = "appearance"
  fields.delete("max_results")
  redirect = security_request("POST", "/preferences", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  check(redirect.response.status_code == 303 && redirect.response.headers["Location"] == "/preferences?section=appearance&saved=1", "Category HTML save lost its redirect fallback")

  fresh_guest_fields = URI::Params.encode({"section" => "appearance", "browser_profile" => "guest", "dark_mode" => "light"})
  fresh_guest = security_request("POST", "/preferences?redirect=false", body: fresh_guest_fields, content_type: "application/x-www-form-urlencoded")
  check(fresh_guest.response.status_code == 200, "A fresh browser could not save a category")
  fresh_raw = URI.decode_www_form(fresh_guest.response.cookies["PREFS"].value)
  check(JSON.parse(fresh_raw).as_h.keys.sort == %w(dark_mode show_nick), "Fresh guest save materialized unrelated preferences")
  oversized = {"future_native" => "x" * 6000}.to_json
  rejected_cookie = security_request("POST", "/preferences?redirect=false", body: fresh_guest_fields, content_type: "application/x-www-form-urlencoded", cookies: "PREFS=#{URI.encode_www_form(oversized)}")
  check(rejected_cookie.response.status_code == 400 && rejected_cookie.response.cookies["PREFS"]?.nil?, "An oversized cookie was silently accepted or discarded future data")
  guest_original = %({"dark_mode":"dark","thin_mode":true,"speed":0.75,"future_native":{"keep":true}})
  guest_fields = {"section" => "appearance", "browser_profile" => "guest", "dark_mode" => "light"}
  guest = security_request("POST", "/preferences?redirect=false", body: URI::Params.encode(guest_fields), content_type: "application/x-www-form-urlencoded", cookies: "PREFS=#{URI.encode_www_form(guest_original)}")
  check(guest.response.status_code == 200, "Guest category save failed")
  guest_raw = URI.decode_www_form(guest.response.cookies["PREFS"].value)
  guest_saved = JSON.parse(guest_raw)
  check(guest_saved["dark_mode"] == "light" && guest_saved["speed"] == 0.75 && guest_saved["thin_mode"] == true && guest_saved["future_native"]["keep"] == true, "Guest category save lost unrelated/native/unknown values")
  guest_read = security_request("GET", "/preferences?section=appearance&format=json", cookies: "PREFS=#{URI.encode_www_form(guest_raw)}")
  check(JSON.parse(guest_read.get("test_result").as(String))["values"] == JSON.parse(guest.get("test_result").as(String))["values"], "Guest cookie read-back failed")
  account_with_guest = security_request("POST", "/preferences?redirect=false", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded", cookies: "PREFS=#{URI.encode_www_form(guest_original)}")
  check(account_with_guest.response.status_code == 200 && JSON.parse(Invidious::Database::Users.preference_json(owner))["speed"] == 1.5, "Account save imported guest state")
  check(Invidious::Database::Users.preference_json(other) == other_before, "HTTP category save changed another account")

  native = Invidious::Helpers::Tokens.generate_token(owner, ["GET:preferences", "PATCH:preferences"], nil, HMAC_KEY, sid)
  patched = security_request("PATCH", "/api/v1/auth/preferences", bearer: native, body: %({"thin_mode":false,"video_codec":"av1"}))
  check(patched.response.status_code == 200, "Native preference patch failed after web category save")
  fields["section"] = "appearance"
  security_request("POST", "/preferences?redirect=false", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  roundtrip = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(roundtrip["thin_mode"] == false && roundtrip["video_codec"] == "av1" && roundtrip["ui_density"] == "compact" && roundtrip["player_style"] == "youtube" && roundtrip["future_native"] == original["future_native"], "Web category save reset a native/compatibility choice")
  # Cached full forms and small header/timezone writes keep raw future keys.
  legacy = security_request("POST", "/preferences?redirect=false", sid: sid, body: URI::Params.encode({"csrf_token" => token, "dark_mode" => "dark"}), content_type: "application/x-www-form-urlencoded")
  check(legacy.response.status_code == 200, "Legacy full-form compatibility save failed")
  legacy_saved = JSON.parse(Invidious::Database::Users.preference_json(owner))
  %w(thin_mode ui_density player_style video_codec preferred_audio seek_seconds speed chat_overlay_mode chat_width_px future_native).each { |key| check(legacy_saved[key] == roundtrip[key], "Legacy form reset omitted native/unknown data: #{key}") }
  %w(sponsorblock_modes sponsorblock_colors channel_spoiler_settings sponsorblock_channel_overrides ai_filter_enabled ai_blocklist_feeds_action).each { |key| check(legacy_saved[key] == roundtrip[key], "Legacy form reset dedicated/omitted enhancement data: #{key}") }
  theme_token = Invidious::Helpers::Tokens.generate_response(sid, {"POST:toggle_theme"}, HMAC_KEY)
  themed = security_request("POST", "/toggle_theme?mode=light&redirect=false", sid: sid, body: URI::Params.encode({"csrf_token" => theme_token}), content_type: "application/x-www-form-urlencoded")
  check(themed.response.status_code == 200 && themed.get("test_result").as(String) == "{}", "Header theme response contract changed")
  themed_saved = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(themed_saved["dark_mode"] == "light", "Header theme did not save the requested mode")
  legacy_saved.as_h.each { |key, value| check(themed_saved[key] == value, "Header theme reset unrelated data: #{key}") unless key == "dark_mode" }
  zone_token = Invidious::Helpers::Tokens.generate_response(sid, {"POST:preferences/timezone"}, HMAC_KEY)
  zone = security_request("POST", "/preferences/timezone", sid: sid, body: URI::Params.encode({"csrf_token" => zone_token, "timezone" => "Asia/Jakarta"}), content_type: "application/x-www-form-urlencoded")
  check(zone.response.status_code == 204, "Timezone detection response contract changed")
  zoned = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(zoned["timezone"] == "Asia/Jakarta", "Timezone detection did not save its validated zone")
  themed_saved.as_h.each { |key, value| check(zoned[key] == value, "Timezone detection reset unrelated data: #{key}") unless key == "timezone" }
  # Both CAS writers read the same version before either updates it.
  read_barrier = Channel(Nil).new(2)
  start_updates = Channel(Nil).new(2)
  cas_results = Channel(Exception?).new(2)
  {"dark_mode" => "dark", "timezone" => "UTC"}.each do |field, value|
    spawn do
      first_attempt = true
      begin
        Invidious::Database::Users.merge_preferences_cas(owner) do |stored|
          if first_attempt
            first_attempt = false
            read_barrier.send(nil)
            start_updates.receive
          end
          stored.merge({field => JSON::Any.new(value)})
        end
        cas_results.send(nil)
      rescue ex
        cas_results.send(ex)
      end
    end
  end
  2.times { read_barrier.receive }
  2.times { start_updates.send(nil) }
  2.times do
    error = cas_results.receive
    raise error if error
  end
  cas_saved = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(cas_saved["dark_mode"] == "dark" && cas_saved["timezone"] == "UTC" && cas_saved["future_native"] == original["future_native"], "Concurrent sparse legacy writes lost another value")
  check_admin_settings(sid, other_sid)
  puts "Category HTTP JSON/HTML/read-back, guest cookie preservation, CSRF, stale profiles, admin-key isolation and native/web round trips passed"
  check_sponsorblock_channel_merges
  check_sponsorblock_channel_routes
  check_masking_channel_routes
  check_blocked_channel_routes
  check_identity_editor_routes
  check_contribution_editor_routes
  check_settings_entry_routes(sid, owner)
  check_retired_enhancement_routes
  puts "Settings ownership, canonical values, atomic category writes, unrelated/native/unknown preservation, real row-lock concurrency and independent playback cleanup passed"
end

# Authenticated browser handlers, real gates/CSRF and an explicitly temporary
# YAML file. The real repository/operator configuration is never written.
def check_admin_settings(sid : String, other_sid : String)
  snapshot = Config.from_yaml(CONFIG.to_yaml)
  policy = Invidious::BotProtection.settings
  keys = ["INVIDIOUS_CONFIG", "INVIDIOUS_CONFIG_FILE", "INVIDIOUS_DEFAULT_USER_PREFERENCES"] + Invidious::AdminSettings::ROOT.map { |key| "INVIDIOUS_#{key.upcase}" }
  environment = keys.to_h { |key| {key, ENV[key]?} }
  temporary = File.tempname("invidious-admin-settings")
  FileUtils.mkdir_p(temporary)
  config_path = File.join(temporary, "config.yml")
  original_yaml = <<-YAML
  hmac_key: test-only-preserved-yaml-key
  database_url: postgres://test-only-preserved-database
  future_operator:
    untouched: 42
  default_user_preferences:
    default_home: Popular
    feed_menu: [Popular, Trending, Subscriptions, Playlists]
    video_codec: av1
    thin_mode: true
    future_default: keep
  YAML
  begin
    keys.each { |key| ENV.delete(key) }
    CONFIG.login_required = false
    CONFIG.login_enabled = true
    CONFIG.registration_enabled = true
    CONFIG.captcha_enabled = false
    ENV["INVIDIOUS_CONFIG_FILE"] = config_path
    File.write(config_path, original_yaml)
    File.chmod(config_path, 0o600)
    email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
    CONFIG.admins = [Invidious::Database::Users.select!(email: email).username]
    Invidious::BotProtection.save(false, 12)
    personal_csrf = Invidious::Helpers::Tokens.generate_response(sid, {"POST:preferences"}, HMAC_KEY)
    config_before = CONFIG.to_yaml
    personal = required_login_response("POST", "/preferences?redirect=false", sid, body: URI::Params.encode({"csrf_token" => personal_csrf, "dark_mode" => "dark", "login_required" => "off", "admin_default_home" => "Playlists"}), content_type: "application/x-www-form-urlencoded")
    check(personal.status_code == 200 && CONFIG.to_yaml == config_before && File.read(config_path) == original_yaml, "Legacy personal save changed or serialized instance configuration")
    personal_before = Invidious::Database::Users.preference_json(email)

    # Admin recovery works during an unavailable verification provider.
    # Model an already-enabled policy after deployment credentials disappear.
    # Enabling an unready policy through the production service must stay forbidden.
    PG_DB.exec("UPDATE bot_protection_settings SET enabled = true, revision = revision + 1")
    sleep 1.05.seconds
    check(Invidious::BotProtection.settings.enabled && !Invidious::BotProtection.readiness.empty?, "Admin outage fixture did not enable the persisted policy")
    get_form = -> { required_login_response("GET", "/admin/settings", sid) }
    revision = -> { get_form.call.body.match(/name="revision" value="([^"]+)"/).not_nil![1] }
    form = get_form.call
    check(form.status_code == 200 && form.headers["Cache-Control"] == "private, no-store" && form.body.includes?("user whitelist mode"), "Admin Settings was gated by verification or omitted access controls")
    check(!form.body.includes?("test-only-preserved-yaml-key") && !form.body.includes?("test-only-preserved-database"), "Admin form leaked undeclared configuration")
    check(required_login_response("GET", "/admin/settings", other_sid).status_code == 403, "Non-admin read instance Settings")
    check(required_login_response("GET", "/admin/settings").status_code == 303, "Guest read instance Settings")
    token = Invidious::Helpers::Tokens.generate_response(sid, {"POST:admin/settings"}, HMAC_KEY)
    fields = {"csrf_token" => token, "revision" => revision.call, "login_required" => "on", "admin_default_home" => "Trending", "modified_source_code_url" => "https://code.example.test/source", "database_url" => "must-not-be-written"}
    submit = ->(body : Hash(String, String), session : String) { required_login_response("POST", "/admin/settings", session, body: URI::Params.encode(body), content_type: "application/x-www-form-urlencoded") }
    invalid_csrf = fields.merge({"csrf_token" => "forged"})
    check(submit.call(invalid_csrf, sid).status_code == 403, "Admin save bypassed CSRF")
    check(submit.call(fields, other_sid).status_code == 403, "Non-admin wrote instance Settings")
    fields["revision"] = "stale"
    check(submit.call(fields, sid).status_code == 409, "Admin save accepted a stale configuration")
    fields["revision"] = revision.call
    fields["admin_default_home"] = "invalid-draft"
    invalid = submit.call(fields, sid)
    check(invalid.status_code == 400 && invalid.body.includes?(%(value="invalid-draft" selected)), "Admin validation lost its typed draft")
    fields["admin_default_home"] = "Trending"
    needs_confirmation = submit.call(fields, sid)
    check(needs_confirmation.status_code == 400 && File.read(config_path) == original_yaml && CONFIG.to_yaml == config_before, "Unconfirmed access change was applied")
    fields["confirm_access"] = "on"
    saved = submit.call(fields, sid)
    check(saved.status_code == 303 && saved.headers["Location"] == "/admin/settings?saved=1", "Admin HTML save did not redirect: #{saved.status_code}")
    stored = YAML.parse(File.read(config_path))
    check(stored["hmac_key"].as_s == "test-only-preserved-yaml-key" && stored["database_url"].as_s == "postgres://test-only-preserved-database" && stored["future_operator"]["untouched"].as_i == 42, "Admin save rewrote unrelated YAML or copied environment-derived CONFIG")
    defaults = stored["default_user_preferences"]
    check(defaults["default_home"].as_s == "Trending" && defaults["feed_menu"].as_a.size == 4 && defaults["video_codec"].as_s == "av1" && defaults["thin_mode"].as_bool && defaults["future_default"].as_s == "keep", "Admin save rewrote unrelated/default preference keys")
    check(CONFIG.default_user_preferences.default_home == "Trending" && CONFIG.default_user_preferences.feed_menu.size == 4, "Instance defaults did not update in memory")
    check(CONFIG.login_required && CONFIG.login_enabled && !CONFIG.registration_enabled, "Required accounts disabled sign-in or changed whitelist semantics")
    check(File.info(config_path).permissions == File::Permissions.new(0o600), "Atomic settings write changed file permissions")
    check(submit.call(fields, sid).status_code == 409, "A stale admin tab overwrote a completed save")

    # An unrelated operator edit made after GET is retained by the YAML merge.
    fields["revision"] = revision.call
    stored.as_h[YAML::Any.new("operator_added")] = YAML::Any.new("retained")
    File.write(config_path, stored.to_yaml)
    check(submit.call(fields, sid).status_code == 303 && YAML.parse(File.read(config_path))["operator_added"].as_s == "retained", "Admin save lost an unrelated concurrent YAML edit")

    # A page loaded after an operator/other-process edit shows saved YAML,
    # even while this worker still has its earlier runtime values.
    edited = YAML.parse(File.read(config_path))
    edited.as_h[YAML::Any.new("registration_enabled")] = YAML::Any.new(true)
    edited["default_user_preferences"].as_h[YAML::Any.new("default_home")] = YAML::Any.new("Playlists")
    File.write(config_path, edited.to_yaml)
    refreshed = XML.parse_html(get_form.call.body)
    check(!refreshed.xpath_nodes("//input[@name='registration_enabled' and @checked]").empty?, "Admin page showed stale runtime access values")
    check(!refreshed.xpath_nodes("//select[@name='admin_default_home']/option[@value='Playlists' and @selected]").empty?, "Admin page showed stale runtime defaults")
    fields.delete("confirm_access")
    fields["registration_enabled"] = "on"
    fields["admin_default_home"] = "Playlists"
    fields["revision"] = revision.call
    check(submit.call(fields, sid).status_code == 303 && CONFIG.registration_enabled && CONFIG.default_user_preferences.default_home == "Playlists", "An unrelated admin save reverted the latest configured values")

    ENV["INVIDIOUS_STATISTICS_ENABLED"] = "true"
    CONFIG.statistics_enabled = true
    fields["revision"] = revision.call
    check(submit.call(fields, sid).status_code == 303 && CONFIG.statistics_enabled && !YAML.parse(File.read(config_path))["statistics_enabled"].as_bool, "Admin save overwrote an environment-managed key")
    ENV.delete("INVIDIOUS_STATISTICS_ENABLED")
    link_path = File.join(temporary, "configured-link.yml")
    File.symlink(config_path, link_path)
    ENV["INVIDIOUS_CONFIG_FILE"] = link_path
    fields["revision"] = revision.call
    check(submit.call(fields, sid).status_code == 303 && File.symlink?(link_path), "Atomic save replaced the configured symlink")

    outcomes = Channel(Int32).new(2)
    fields["revision"] = revision.call
    %w(Popular Trending Playlists).reject { |home| home == CONFIG.default_user_preferences.default_home }.first(2).each do |home|
      candidate = fields.merge({"admin_default_home" => home})
      spawn { outcomes.send(submit.call(candidate, sid).status_code) }
    end
    check([outcomes.receive, outcomes.receive].sort == [303, 409], "Concurrent admin writes lost stale-tab protection")
    last_file = File.read(config_path)
    fields["revision"] = revision.call
    ENV["INVIDIOUS_CONFIG"] = "hmac_key: environment-only-test"
    check(submit.call(fields, sid).status_code == 503 && File.read(config_path) == last_file, "Environment-only configuration was silently written to YAML")
    ENV.delete("INVIDIOUS_CONFIG")
    File.chmod(config_path, 0o400)
    fields["revision"] = revision.call
    unavailable = submit.call(fields, sid)
    check(unavailable.status_code == 503 && unavailable.body.includes?("Your draft is still here") && File.read(config_path) == last_file, "Unwritable YAML claimed success or lost the draft")
    check(Invidious::Database::Users.preference_json(email) == personal_before, "Instance Settings changed personal preferences")
    puts "Isolated admin HTML/role/CSRF/access confirmation, no-store, YAML preservation, environment keys, symlinks, permissions, concurrency and unavailable-file draft checks passed"
  ensure
    {% for field in %w(popular_enabled captcha_enabled login_enabled login_required registration_enabled statistics_enabled) %}
      CONFIG.{{field.id}} = snapshot.{{field.id}}
    {% end %}
    CONFIG.modified_source_code_url = snapshot.modified_source_code_url
    CONFIG.default_user_preferences = snapshot.default_user_preferences
    CONFIG.admins = snapshot.admins
    environment.each do |key, value|
      if value
        ENV[key] = value
      else
        ENV.delete(key)
      end
    end
    Invidious::BotProtection.save(policy.enabled, policy.duration_hours)
    FileUtils.rm_rf(temporary)
  end
end

# Run with the existing empty-database guard and production auth middleware.
def check_chat_settings
  sid = Invidious::Database::Accounts.register("ChatSettingsOwner", "isolated replay preferences test password", Preferences.from_json("{}"))
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  native = JSON.parse(%({"chat_overlay_mode":true,"chat_overlay_opacity":0,"chat_overlay_x":550,"chat_overlay_y":75,"chat_overlay_width":400,"chat_overlay_height":800,"future_chat_native":{"values":[1,true,"literal"]},"dark_mode":"dark"})).as_h
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", native.to_json, email)
  csrf = JSON.parse(security_request("GET", "/api/v1/auth/csrf", sid: sid).get("test_result").as(String))["csrfToken"].as_s
  body = {chat_show_timestamps: false, chat_word_blacklist: "/spam/"}.to_json
  before = Invidious::Database::Users.preference_json(email)
  check(security_request("PATCH", "/api/v1/auth/chat_preferences", sid: sid, body: body).response.status_code == 403, "Chat PATCH bypassed cookie CSRF")
  check(security_request("PATCH", "/api/v1/auth/chat_preferences", sid: sid, csrf: "forged", body: body).response.status_code == 403, "Chat PATCH accepted forged CSRF")
  check(Invidious::Database::Users.preference_json(email) == before, "Rejected chat PATCH mutated preferences")
  saved = security_request("PATCH", "/api/v1/auth/chat_preferences", sid: sid, csrf: csrf, body: body)
  check(saved.response.status_code == 200, "Native chat PATCH failed")
  raw = JSON.parse(Invidious::Database::Users.preference_json(email)).as_h
  native.each { |key, value| check(raw[key] == value, "Chat PATCH changed unrelated/native raw field: #{key}") }
  check(raw["chat_show_timestamps"] == false && raw["chat_word_blacklist"] == "/spam/", "Chat PATCH did not apply owned fields")
  before = raw.to_json
  [{chat_font_scale: 151}.to_json, {chat_width_px: 279}.to_json, {chat_overlay_x: 800}.to_json, {private_id: "must-not-save"}.to_json, {chat_word_blacklist: "é" * 513}.to_json].each do |invalid|
    check(security_request("PATCH", "/api/v1/auth/chat_preferences", sid: sid, csrf: csrf, body: invalid).response.status_code == 400, "Invalid native chat field/range accepted")
    check(Invidious::Database::Users.preference_json(email) == before, "Rejected chat value partially wrote preferences")
  end
  restricted = Invidious::Helpers::Tokens.generate_token(email, ["GET:preferences"], nil, HMAC_KEY, sid)
  check(security_request("PATCH", "/api/v1/auth/chat_preferences", bearer: restricted, body: body).response.status_code == 403, "Preference-read token gained chat-write scope")
  bearer = Invidious::Helpers::Tokens.generate_token(email, ["PATCH:chat_preferences"], nil, HMAC_KEY, sid)
  check(security_request("PATCH", "/api/v1/auth/chat_preferences", bearer: bearer, body: {chat_font_scale: 75, chat_width_px: 640}.to_json).response.status_code == 200, "Exact native chat scope/range boundary failed")
  native_fields = JSON.parse(Invidious::Database::Users.preference_json(email))
  native.each { |key, value| check(native_fields[key] == value, "Bearer chat save reset compatibility data: #{key}") }

  timing_path = "/api/v1/auth/chat_timing/abcdefghijk"
  timing = -> { JSON.parse(security_request("GET", timing_path, sid: sid).get("test_result").as(String))["offsetMs"].as_i }
  check(timing.call == 0, "New account inherited a per-video timing")
  check(security_request("PUT", timing_path, sid: sid, body: {offsetMs: 125}.to_json).response.status_code == 403, "Video timing PUT bypassed cookie CSRF")
  {-3_600_000, 3_600_000, 125}.each do |offset|
    saved_timing = security_request("PUT", timing_path, sid: sid, csrf: csrf, body: {offsetMs: offset}.to_json)
    check(saved_timing.response.status_code == 200 && timing.call == offset, "Video timing boundary/precision/canonical read-back failed")
  end
  [{offsetMs: 3_600_001}.to_json, {offsetMs: -3_600_001}.to_json, {offsetMs: 1.25}.to_json, {offsetMs: "125"}.to_json].each do |bad|
    check(security_request("PUT", timing_path, sid: sid, csrf: csrf, body: bad).response.status_code == 400 && timing.call == 125, "Invalid video timing changed the saved value")
  end
  check(security_request("GET", timing_path, bearer: restricted).response.status_code == 403, "Preference-read token gained timing access")
  timing_bearer = Invidious::Helpers::Tokens.generate_token(email, ["PUT:chat_timing/*", "GET:chat_timing/*"], nil, HMAC_KEY, sid)
  check(security_request("PUT", timing_path, bearer: timing_bearer, body: {offsetMs: -125}.to_json).response.status_code == 200, "Native timing write scope failed")
  check(JSON.parse(security_request("GET", timing_path, bearer: timing_bearer).get("test_result").as(String))["offsetMs"] == -125, "Native timing read scope failed")
  other_sid = Invidious::Database::Accounts.register("ChatTimingOther", "another isolated timing test password", Preferences.from_json("{}"))
  check(JSON.parse(security_request("GET", timing_path, sid: other_sid).get("test_result").as(String))["offsetMs"] == 0, "Video timing leaked across accounts")
  check(security_request("GET", "/api/v1/auth/chat_timing/invalid", sid: sid).response.status_code == 400, "Invalid timing video ID accepted")
  check(Invidious::Database::Users.preference_json(email) == native_fields.to_json, "Video timing rewrote unrelated account preferences")

  page = security_request("GET", "/preferences?section=chat", sid: sid)
  html = page.get("test_result").as(String)
  check(page.response.status_code == 200 && html.includes?("data-chat-preferences") && !html.includes?("id=\"chat-overlay"), "Dedicated chat page is unavailable or exposes retired overlay UI")
  check(page.response.headers["Cache-Control"] == "private, no-store", "Private chat editor was cacheable")
  token = Invidious::Helpers::Tokens.generate_response(sid, {"POST:preferences"}, HMAC_KEY)
  fields = {"section" => "chat", "csrf_token" => token, "browser_profile" => Invidious::BrowserProfiles.account_scope(email), "chat_show_timestamps" => "on", "chat_user_blacklist" => "UCblocked", "chat_word_blacklist" => "literal /pattern/", "chat_overlay_mode" => "off", "chat_font_scale" => "100"}
  posted = security_request("POST", "/preferences", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  check(posted.response.status_code == 302 && posted.response.headers["Location"] == "/preferences?section=chat&saved=1", "No-JavaScript chat form failed")
  raw = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(raw["chat_user_blacklist"] == "UCblocked" && raw["chat_show_timestamps"] == true, "Chat form did not apply account-owned fields")
  check(raw["chat_font_scale"] == 75 && raw["chat_overlay_mode"] == true && raw["future_chat_native"] == native["future_chat_native"], "Browser chat form changed native/browser-only or unknown values")
  before = Invidious::Database::Users.preference_json(email)
  invalid = fields.merge({"chat_word_blacklist" => "é" * 513})
  failed = security_request("POST", "/preferences", sid: sid, body: URI::Params.encode(invalid), content_type: "application/x-www-form-urlencoded")
  check(failed.response.status_code == 400 && failed.get("test_result").as(String).includes?("é" * 513), "Failed chat form lost its literal draft")
  check(Invidious::Database::Users.preference_json(email) == before, "Failed chat form changed account data")
  stale = fields.merge({"browser_profile" => "guest"})
  check(security_request("POST", "/preferences", sid: sid, body: URI::Params.encode(stale), content_type: "application/x-www-form-urlencoded").response.status_code == 409, "Stale-profile chat form saved")
  check(security_request("POST", "/preferences", sid: sid, body: URI::Params.encode(fields.merge({"csrf_token" => "forged"})), content_type: "application/x-www-form-urlencoded").response.status_code == 403, "Chat browser form bypassed CSRF")
  check(Invidious::Database::Users.preference_json(email) == before, "Rejected chat browser request changed preferences")

  # Historical geometry is untouched by a timestamp/filter-only browser write.
  legacy = JSON.parse(before).as_h; legacy["chat_overlay_x"] = JSON::Any.new(900)
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", legacy.to_json, email)
  changed = security_request("PATCH", "/api/v1/auth/chat_preferences", sid: sid, csrf: csrf, body: {chat_show_timestamps: false}.to_json)
  check(changed.response.status_code == 200, "Retired geometry blocked an unrelated chat edit")
  check(JSON.parse(Invidious::Database::Users.preference_json(email))["chat_overlay_x"] == 900, "Browser edit normalized historical geometry")

  locked = Channel(Nil).new; release = Channel(Nil).new; results = Channel(Exception?).new(2)
  spawn do
    begin
      Invidious::Database::Users.merge_preferences(email) do |_conn, stored|
        locked.send(nil); release.receive
        stored.merge({"dark_mode" => JSON::Any.new("light")})
      end
      results.send(nil)
    rescue ex
      results.send(ex)
    end
  end
  locked.receive
  spawn do
    begin
      Invidious::ChatPreferences.save_account(email, JSON.parse({chat_word_blacklist: "new filter"}.to_json).as_h)
      results.send(nil)
    rescue ex
      results.send(ex)
    end
  end
  Fiber.yield; release.send(nil)
  2.times do
    error = results.receive; raise error if error
  end
  raw = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(raw["dark_mode"] == "light" && raw["chat_word_blacklist"] == "new filter" && raw["chat_overlay_x"] == 900 && raw["future_chat_native"] == native["future_chat_native"], "Concurrent chat/category save lost latest raw values")
  puts "Chat/timing native scopes/limits/CSRF, raw compatibility, web drafts/profiles, no-JS form and concurrent merges passed"
end

# Exercise the production web-channel save service against the guarded database.
def check_sponsorblock_channel_merges
  sid = Invidious::Database::Accounts.register("ChannelMergeOwner", "isolated channel merge password", Preferences.from_json("{}"))
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  original = JSON.parse(Preferences.from_json("{}").to_json).as_h
  original["future_native"] = JSON.parse(%({"preserve":[1,true,null]}))
  original["chat_overlay_x"] = JSON::Any.new(900_i64)
  original["sponsorblock_channel_overrides"] = JSON.parse(%({"UCaaaaaaaaaaaaaaaaaaaaaa":{"name":"Latest name","enabled":false,"modes":{"sponsor":"manual","future":"opaque"},"native_future":{"keep":true}},"UCbbbbbbbbbbbbbbbbbbbbbb":{"name":"Other channel","enabled":true,"modes":{"intro":"auto"},"unknown":123}}))
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", original.to_json, email)
  # An unrelated category changed after the editor's stale values were read.
  Invidious::WebPreferences.save_account(email, "appearance", URI::Params.parse("dark_mode=light"), I18n::LOCALES_LIST.keys)
  entry = Invidious::SponsorBlock::ChannelOverride.new("Stale name", true, {"sponsor" => "auto"})
  Invidious::SponsorBlock.save_channel_override(email, "UCaaaaaaaaaaaaaaaaaaaaaa", entry)
  raw = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(raw["dark_mode"] == "light" && raw["future_native"] == original["future_native"] && raw["chat_overlay_x"] == original["chat_overlay_x"], "Channel save overwrote latest category/native/unknown state")
  check(raw["sponsorblock_channel_overrides"]["UCbbbbbbbbbbbbbbbbbbbbbb"] == original["sponsorblock_channel_overrides"]["UCbbbbbbbbbbbbbbbbbbbbbb"], "Channel save rewrote another channel")
  target = raw["sponsorblock_channel_overrides"]["UCaaaaaaaaaaaaaaaaaaaaaa"]
  check(target["name"] == "Latest name" && target["enabled"] == true && target["modes"]["sponsor"] == "auto" && target["modes"]["future"] == "opaque" && target["native_future"] == original["sponsorblock_channel_overrides"]["UCaaaaaaaaaaaaaaaaaaaaaa"]["native_future"], "Channel save lost owned or future native values")
  inherited = Invidious::SponsorBlock::ChannelOverride.new("Stale name", nil, {} of String => String)
  Invidious::SponsorBlock.save_channel_override(email, "UCaaaaaaaaaaaaaaaaaaaaaa", inherited)
  raw = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(raw["sponsorblock_channel_overrides"]["UCaaaaaaaaaaaaaaaaaaaaaa"]["modes"].as_h.keys == ["future"], "Saving inheritance removed future-only modes")
  Invidious::SponsorBlock.save_channel_override(email, "UCaaaaaaaaaaaaaaaaaaaaaa", nil)
  raw = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(!raw["sponsorblock_channel_overrides"].as_h.has_key?("UCaaaaaaaaaaaaaaaaaaaaaa") && raw["sponsorblock_channel_overrides"]["UCbbbbbbbbbbbbbbbbbbbbbb"] == original["sponsorblock_channel_overrides"]["UCbbbbbbbbbbbbbbbbbbbbbb"], "Explicit channel reset crossed its owner")
  puts "SponsorBlock channel merges preserve latest category, other-channel, native and unknown raw preferences"
end

def check_sponsorblock_channel_routes
  sid = Invidious::Database::Accounts.register("ChannelEditorOwner", "isolated channel editor password", Preferences.from_json("{}"))
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  id = "UC" + "a" * 22
  other = "UC" + "b" * 22
  raw = JSON.parse(Preferences.from_json("{}").to_json).as_h
  raw["sponsorblock_channel_overrides"] = JSON.parse({id => {name: "<Known channel>", enabled: false, modes: {sponsor: "manual", future: "opaque"}, native_future: [1, 2]}, other => {name: "Other channel", enabled: true, modes: {intro: "auto"}}}.to_json)
  raw["native_future"] = JSON.parse(%({"keep":true}))
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", raw.to_json, email)
  path = Invidious::Routes::SponsorBlockPreferences::PATH
  read = security_request("GET", "#{path}?format=json", sid: sid)
  state = JSON.parse(read.get("test_result").as(String))
  check(read.response.status_code == 200 && read.response.headers["Cache-Control"].includes?("no-store"), "Channel read is unavailable or cacheable")
  check(state["profile"] == Invidious::BrowserProfiles.account_scope(email) && !read.get("test_result").as(String).includes?(email), "Channel read exposed identity or lost profile ownership")
  token = state["csrf"].as_s
  profile = state["profile"].as_s
  payload = {"channel" => id, "action" => "save", "enabled" => "true", "mode_sponsor" => "marker", "csrf_token" => token, "browser_profile" => profile}
  before = Invidious::Database::Users.preference_json(email)
  {"csrf_token" => "forged", "browser_profile" => "other-profile", "mode_intro" => "native<draft>&", "action" => "invalid"}.each do |field, value|
    values = payload.dup
    values[field] = value
    rejected = security_request("POST", "#{path}?format=json", sid: sid, body: URI::Params.encode(values), content_type: "application/x-www-form-urlencoded")
    check({400, 403, 409}.includes?(rejected.response.status_code) && Invidious::Database::Users.preference_json(email) == before, "Rejected channel write changed state")
  end
  failed_values = payload.merge({"mode_intro" => "native<draft>&"})
  failed = security_request("POST", path, sid: sid, body: URI::Params.encode(failed_values), content_type: "application/x-www-form-urlencoded")
  failed_html = XML.parse_html(failed.get("test_result").as(String))
  check(failed.response.status_code == 400 && failed_html.xpath_string("string(//select[@name='mode_intro']/option[@selected]/@value)") == "native<draft>&", "Channel HTML failure lost literal draft")
  expired = security_request("POST", path, sid: sid, body: URI::Params.encode(payload.merge({"csrf_token" => "expired"})), content_type: "application/x-www-form-urlencoded")
  expired_html = XML.parse_html(expired.get("test_result").as(String))
  check(expired.response.status_code == 403 && expired_html.xpath_string("string(//select[@name='mode_sponsor']/option[@selected]/@value)") == "marker" && !expired_html.xpath_string("string(//form[contains(@class,'sponsorblock-channel-form')]/input[@name='csrf_token']/@value)").empty?, "Expired channel CSRF lost draft or replacement token")
  stale = security_request("POST", path, sid: sid, body: URI::Params.encode(payload.merge({"browser_profile" => "other-profile"})), content_type: "application/x-www-form-urlencoded")
  check(stale.response.status_code == 409 && XML.parse_html(stale.get("test_result").as(String)).xpath_nodes("//fieldset[@disabled]").size == 1, "Stale profile draft remained writable")
  saved = security_request("POST", "#{path}?format=json", sid: sid, body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded")
  canonical = JSON.parse(saved.get("test_result").as(String))
  check(saved.response.status_code == 200 && canonical["overrides"][id]["enabled"] == true && canonical["overrides"][id]["modes"]["sponsor"] == "marker", "Channel save did not return canonical state")
  stored = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(stored["native_future"] == raw["native_future"] && stored["sponsorblock_channel_overrides"][other] == raw["sponsorblock_channel_overrides"][other] && stored["sponsorblock_channel_overrides"][id]["modes"]["future"] == "opaque", "Channel HTTP write changed unrelated/native state")
  # Fail the real UPDATE to prove the HTML fallback blocks an uncertain repeat.
  PG_DB.exec("CREATE FUNCTION channel_test_write_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic channel write failure'; END $$")
  PG_DB.exec("CREATE TRIGGER channel_test_write_failure BEFORE UPDATE OF preferences ON users FOR EACH ROW EXECUTE FUNCTION channel_test_write_failure()")
  begin
    unknown = security_request("POST", path, sid: sid, body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded")
    html = XML.parse_html(unknown.get("test_result").as(String))
    check(unknown.response.status_code == 503 && !html.xpath_nodes("//button[@value='save'][@disabled]").empty?, "Uncertain channel HTML write enabled immediate repeat")
    check(html.xpath_string("string(//select[@name='mode_sponsor']/option[@selected]/@value)") == "marker", "Uncertain channel HTML write lost its draft")
  ensure
    PG_DB.exec("DROP TRIGGER channel_test_write_failure ON users")
    PG_DB.exec("DROP FUNCTION channel_test_write_failure()")
  end
  reset = security_request("POST", "#{path}?format=json", sid: sid, body: URI::Params.encode({"channel" => id, "action" => "reset", "csrf_token" => token, "browser_profile" => profile}), content_type: "application/x-www-form-urlencoded")
  check(reset.response.status_code == 200 && !JSON.parse(reset.get("test_result").as(String))["overrides"].as_h.has_key?(id), "Channel reset left its target")
  check(security_request("POST", "#{path}?format=json", body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded").response.status_code == 403, "Guest channel account write was accepted")
  puts "SponsorBlock channel web JSON/HTML, canonical state, CSRF/profile/role, literal drafts and uncertain database-write checks passed"
end

def check_masking_channel_routes
  sid = Invidious::Database::Accounts.register("MaskingEditorOwner", "isolated masking editor password", Preferences.from_json("{}"))
  owner = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  id = "UC" + "a" * 22
  other = "UC" + "b" * 22
  raw = JSON.parse(Preferences.from_json("{}").to_json).as_h
  raw["future_native"] = JSON.parse(%({"keep":[true,2,null]}))
  raw["channel_spoiler_settings"] = JSON.parse({id => {name: "<Current channel>", hide_title: true, hide_thumbnail: false, reveal_after_days: 7, future_rule: [true, 2]}, other => {name: "Other channel", hide_title: false, hide_thumbnail: true, reveal_after_days: nil, unknown: 123}}.to_json)
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", raw.to_json, owner)
  # Force a preceding unrelated write to hold the same row lock.
  locked = Channel(Nil).new
  release = Channel(Nil).new
  results = Channel(Exception?).new(2)
  spawn do
    begin
      Invidious::Database::Users.merge_preferences(owner) do |_conn, latest|
        locked.send(nil)
        release.receive
        latest["concurrent_native"] = JSON::Any.new("keep latest")
        latest
      end
      results.send(nil)
    rescue ex
      results.send(ex)
    end
  end
  locked.receive
  spawn do
    begin
      Invidious::ChannelSpoilers.save_web_rule(owner, id, Invidious::ChannelSpoilers::Rule.new("Stale name", false, true, 14))
      results.send(nil)
    rescue ex
      results.send(ex)
    end
  end
  Fiber.yield
  release.send(nil)
  2.times { check(results.receive.nil?, "Concurrent masking/category write failed") }
  stored = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(stored["concurrent_native"] == "keep latest" && stored["future_native"] == raw["future_native"], "Masking save lost a preceding locked/native write")
  check(stored["channel_spoiler_settings"][other] == raw["channel_spoiler_settings"][other] && stored["channel_spoiler_settings"][id]["future_rule"] == raw["channel_spoiler_settings"][id]["future_rule"] && stored["channel_spoiler_settings"][id]["name"] == "<Current channel>", "Masking save replaced other channels or native/name state")
  path = Invidious::Routes::ChannelSpoilerPreferences::PATH
  read = security_request("GET", "#{path}?format=json", sid: sid)
  state = JSON.parse(read.get("test_result").as(String))
  check(read.response.status_code == 200 && read.response.headers["Cache-Control"].includes?("no-store") && state["profile"] == Invidious::BrowserProfiles.account_scope(owner), "Masking read lost canonical ownership/no-store")
  token = state["csrf"].as_s
  payload = {"channel" => id, "action" => "save", "hide_title" => "on", "hide_thumbnail" => "off", "reveal_after_days" => "21", "csrf_token" => token, "browser_profile" => state["profile"].as_s}
  before = Invidious::Database::Users.preference_json(owner)
  {"csrf_token" => "forged", "browser_profile" => "old-profile", "hide_title" => "false", "reveal_after_days" => "2147483648", "action" => "invalid"}.each do |field, value|
    rejected = security_request("POST", "#{path}?format=json", sid: sid, body: URI::Params.encode(payload.merge({field => value})), content_type: "application/x-www-form-urlencoded")
    check({400, 403, 409}.includes?(rejected.response.status_code) && Invidious::Database::Users.preference_json(owner) == before, "Rejected masking write changed state")
  end
  invalid = security_request("POST", path, sid: sid, body: URI::Params.encode(payload.merge({"reveal_after_days" => "days<draft>&"})), content_type: "application/x-www-form-urlencoded")
  html = XML.parse_html(invalid.get("test_result").as(String))
  check(invalid.response.status_code == 400 && html.xpath_string("string(//input[@name='reveal_after_days']/@value)") == "days<draft>&" && !html.xpath_nodes("//input[@name='hide_title'][@checked]").empty?, "Masking HTML validation lost literal draft")
  stale = security_request("POST", path, sid: sid, body: URI::Params.encode(payload.merge({"browser_profile" => "old-profile"})), content_type: "application/x-www-form-urlencoded")
  check(stale.response.status_code == 409 && !XML.parse_html(stale.get("test_result").as(String)).xpath_nodes("//fieldset[@disabled]").empty?, "Stale masking draft remained writable")
  expired = security_request("POST", path, sid: sid, body: URI::Params.encode(payload.merge({"csrf_token" => "expired"})), content_type: "application/x-www-form-urlencoded")
  html = XML.parse_html(expired.get("test_result").as(String))
  check(expired.response.status_code == 403 && html.xpath_string("string(//input[@name='reveal_after_days']/@value)") == "21", "Expired masking CSRF lost its draft")
  saved = security_request("POST", "#{path}?format=json", sid: sid, body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded")
  value = JSON.parse(saved.get("test_result").as(String))["rules"][id]
  check(saved.response.status_code == 200 && value["hide_title"] == true && value["hide_thumbnail"] == false && value["reveal_after_days"] == 21, "Masking web canonical save failed")
  stored = JSON.parse(Invidious::Database::Users.preference_json(owner))
  check(stored["channel_spoiler_settings"][id]["future_rule"] == raw["channel_spoiler_settings"][id]["future_rule"] && stored["channel_spoiler_settings"][other] == raw["channel_spoiler_settings"][other], "Masking HTTP save erased native/other-channel state")
  PG_DB.exec("CREATE FUNCTION masking_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic masking write failure'; END $$")
  PG_DB.exec("CREATE TRIGGER masking_test_failure BEFORE UPDATE OF preferences ON users FOR EACH ROW EXECUTE FUNCTION masking_test_failure()")
  begin
    unknown = security_request("POST", path, sid: sid, body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded")
    html = XML.parse_html(unknown.get("test_result").as(String))
    check(unknown.response.status_code == 503 && !html.xpath_nodes("//button[@value='save'][@disabled]").empty? && html.xpath_string("string(//input[@name='reveal_after_days']/@value)") == "21", "Uncertain masking HTML did not retain/block its draft")
  ensure
    PG_DB.exec("DROP TRIGGER masking_test_failure ON users")
    PG_DB.exec("DROP FUNCTION masking_test_failure()")
  end
  # Old ordinary forms omit the optional profile marker but retain route-bound CSRF.
  legacy = payload.reject { |key, _| key == "browser_profile" }
  fallback = security_request("POST", path, sid: sid, body: URI::Params.encode(legacy), content_type: "application/x-www-form-urlencoded")
  check(fallback.response.status_code == 302 && fallback.response.headers["Location"].includes?("saved=1"), "Masking legacy/no-JS POST was broken")
  reset = security_request("POST", "#{path}?format=json", sid: sid, body: URI::Params.encode(payload.merge({"action" => "reset"})), content_type: "application/x-www-form-urlencoded")
  check(reset.response.status_code == 200 && !JSON.parse(reset.get("test_result").as(String))["rules"].as_h.has_key?(id), "Explicit masking remove left its target")
  check(security_request("POST", "#{path}?format=json", body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded").response.status_code == 403, "Guest masking account write was accepted")
  puts "Masking row-lock/raw preservation, canonical web JSON/HTML, CSRF/profile/roles, literal/uncertain drafts and ordinary forms passed"
end

def check_blocked_channel_routes
  sid = Invidious::Database::Accounts.register("BlockManagerOwner", "isolated blocked manager password", Preferences.from_json("{}"))
  other_sid = Invidious::Database::Accounts.register("BlockManagerOther", "separate blocked manager password", Preferences.from_json("{}"))
  owner = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  other = Invidious::Database::SessionIDs.select_email(other_sid).not_nil!
  id = "UC" + "a" * 22
  second = "UC" + "b" * 22
  Invidious::Database::BlockedChannels.block(owner, id, "<Current channel>")
  Invidious::Database::BlockedChannels.block(owner, second, "Other channel")
  Invidious::Database::BlockedChannels.block(other, id, "Other account")
  preferences = Invidious::Database::Users.preference_json(owner)
  path = Invidious::Routes::BlockedChannels::PATH
  guest = security_request("GET", path)
  check(guest.response.status_code == 302 && guest.response.headers["Location"].includes?("login"), "Guest block manager did not retain sign-in navigation")
  check(security_request("GET", "#{path}?format=json").response.status_code == 403, "Guest canonical block list was readable")
  read = security_request("GET", "#{path}?format=json", sid: sid)
  state = JSON.parse(read.get("test_result").as(String))
  check(read.response.status_code == 200 && read.response.headers["Cache-Control"].includes?("no-store") && state["profile"] == Invidious::BrowserProfiles.account_scope(owner), "Block manager read lost ownership or no-store")
  check(state["channels"].as_a.size == 2 && !read.get("test_result").as(String).includes?(owner), "Block manager state leaked identity or lost rows")
  token = state["csrf"].as_s
  payload = {"ucid" => id, "name" => "<Literal draft>", "action" => "unblock", "csrf_token" => token, "browser_profile" => state["profile"].as_s}
  {"csrf_token" => "expired", "browser_profile" => "old-profile", "ucid" => "invalid", "action" => "invalid<draft>&"}.each do |field, value|
    rejected = security_request("POST", "#{path}?format=json", sid: sid, body: URI::Params.encode(payload.merge({field => value})), content_type: "application/x-www-form-urlencoded")
    check({400, 409}.includes?(rejected.response.status_code) && Invidious::Database::BlockedChannels.ids(owner).sort == [id, second].sort, "Rejected block manager write changed state")
  end
  failed = security_request("POST", path, sid: sid, body: URI::Params.encode(payload.merge({"csrf_token" => "expired"})), content_type: "application/x-www-form-urlencoded")
  html = XML.parse_html(failed.get("test_result").as(String))
  check(failed.response.status_code == 400 && html.xpath_string("string(//*[@data-block-pending]/strong)") == "<Literal draft>" && html.xpath_nodes("//*[@data-block-channel]").size == 2, "Block HTML failure lost literal action/rows")
  check(html.xpath_string("string(//form[@data-block-unblock]/input[@name='csrf_token']/@value)") != "expired", "Block HTML failure reused expired CSRF")
  stale = security_request("POST", path, sid: sid, body: URI::Params.encode(payload.merge({"browser_profile" => "old-profile"})), content_type: "application/x-www-form-urlencoded")
  check(stale.response.status_code == 409 && !XML.parse_html(stale.get("test_result").as(String)).xpath_nodes("//form[@data-block-unblock]/button[@disabled]").empty?, "Stale block manager enabled writes")
  # Native and web clients keep the same table, response fields and token scopes.
  native = security_request("GET", "/api/v1/auth/blocked_channels", sid: sid)
  check(JSON.parse(native.get("test_result").as(String)).as_a.size == 2, "Native block list lost web entries")
  wrong_scope = Invidious::Helpers::Tokens.generate_token(owner, ["GET:preferences"], nil, HMAC_KEY, sid)
  check(security_request("GET", "/api/v1/auth/blocked_channels", bearer: wrong_scope).response.status_code == 403, "Preference scope gained native block access")
  saved = security_request("POST", "#{path}?format=json", sid: sid, body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded")
  check(saved.response.status_code == 200 && JSON.parse(saved.get("test_result").as(String))["channels"].as_a.map(&.["authorId"].as_s) == [second], "Canonical unblock did not return the remaining rows")
  check(Invidious::Database::BlockedChannels.ids(other) == [id] && Invidious::Database::Users.preference_json(owner) == preferences, "Unblock changed another account or preference document")
  legacy = {"ucid" => id, "action" => "block", "name" => " Legacy <name> ", "csrf_token" => Invidious::Helpers::Tokens.generate_response(sid, {":blocked_channels"}, HMAC_KEY)}
  2.times do
    response = security_request("POST", "#{path}?redirect=false", sid: sid, body: URI::Params.encode(legacy), content_type: "application/x-www-form-urlencoded")
    check(response.response.status_code == 200 && JSON.parse(response.get("test_result").as(String)) == JSON.parse(%({"blocked":true})), "Legacy contextual block JSON changed")
  end
  check(Invidious::Database::BlockedChannels.list(owner).count { |ucid, _| ucid == id } == 1, "Block was not idempotent")
  PG_DB.exec("CREATE FUNCTION blocked_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic unblock failure'; END $$")
  PG_DB.exec("CREATE TRIGGER blocked_test_failure BEFORE DELETE ON blocked_channels FOR EACH ROW EXECUTE FUNCTION blocked_test_failure()")
  begin
    unknown = security_request("POST", path, sid: sid, body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded")
    html = XML.parse_html(unknown.get("test_result").as(String))
    check(unknown.response.status_code == 503 && html.xpath_nodes("//form[@data-block-unblock]/button[@disabled]").size == 2 && html.xpath_nodes("//*[@data-block-channel]").size == 2, "Uncertain block HTML removed rows or enabled repeat")
  ensure
    PG_DB.exec("DROP TRIGGER blocked_test_failure ON blocked_channels")
    PG_DB.exec("DROP FUNCTION blocked_test_failure()")
  end
  fallback = security_request("POST", path, sid: sid, body: URI::Params.encode(payload.reject { |key, _| key == "browser_profile" }), content_type: "application/x-www-form-urlencoded")
  check(fallback.response.status_code == 302 && !Invidious::Database::BlockedChannels.ids(owner).includes?(id), "Ordinary block manager form failed")
  check(security_request("POST", "#{path}?format=json", body: URI::Params.encode(payload), content_type: "application/x-www-form-urlencoded").response.status_code == 403, "Guest block write accepted")
  PG_DB.exec("ALTER TABLE blocked_channels RENAME TO blocked_channels_test_saved")
  begin
    unavailable = security_request("GET", path, sid: sid)
    html = XML.parse_html(unavailable.get("test_result").as(String))
    check(unavailable.response.status_code == 503 && html.xpath_nodes("//*[@id='blocked-status'][@role='alert']").size == 1 && html.xpath_nodes("//*[@id='blocked-empty'][not(@hidden)]").empty?, "Unavailable block list was presented as empty")
  ensure
    PG_DB.exec("ALTER TABLE blocked_channels_test_saved RENAME TO blocked_channels")
  end
  puts "Blocked manager web/native ownership, canonical/legacy JSON, CSRF/profile, literal/uncertain HTML, idempotence and unavailable-list checks passed"
end

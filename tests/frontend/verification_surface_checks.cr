# D7 standalone views use synthetic public configuration and no policy/provider IO.
def standalone_cloudflare_fixture(mode, locale = "en-US")
  env = fixture_env("/verify?client=native-cloudflare", mode, locale: locale)
  Invidious::Routes::Verification.page(env).as(String)
end

def standalone_verification_fixture(mode, locale = "en-US", native = false, enabled = true, ready = true)
  env = fixture_env("/verify", mode, locale: locale)
  policy = Invidious::BotProtection::Settings.new(enabled, 12, 1_i64)
  destination = "/watch?v=abcdefghijk&t=42"
  previous = CONFIG.turnstile_site_key
  CONFIG.turnstile_site_key = "1x00000000000000000000AA"
  render "src/invidious/views/verification.ecr"
ensure
  CONFIG.turnstile_site_key = previous || ""
end

def standalone_bot_admin_fixture(mode, locale = "en-US", missing = false, failed = false)
  env = fixture_env("/admin/bot-protection", mode, locale: locale)
  policy = Invidious::BotProtection::Settings.new(true, 12, 1_i64)
  form_enabled = true
  form_duration = failed ? 1 : 12
  problems = missing ? [%(<unsafe> & "diagnostic" configuration is missing)] : [] of String
  message = failed ? "This form has expired. Review it and save again." : nil
  env.response.status_code = 403 if failed
  csrf_token = "synthetic-admin-csrf"
  render "src/invidious/views/admin/bot_protection.ecr"
end

def write_verification_surface_fixtures(output)
  {"light", "dark", "rtl"}.each do |variant|
    mode, locale = variant == "rtl" ? {"dark", "ar"} : {variant, "en-US"}
    File.write("#{output}/d7-verify-cloudflare-#{variant}.html", standalone_cloudflare_fixture(mode, locale))
    {"browser" => {false, true, true}, "native" => {true, true, true}, "disabled" => {true, false, true}, "unconfigured" => {false, true, false}}.each do |name, settings|
      File.write("#{output}/d7-verify-#{name}-#{variant}.html", standalone_verification_fixture(mode, locale, *settings))
    end
    notice_env = fixture_env("/embed/test", mode, locale: locale)
    File.write("#{output}/d7-verify-notice-iframe-#{variant}.html", Invidious::Frontend::Standalone.notice(notice_env, 403, "Verification required", "Verification is required to play this video.", "/verify?return=%2Fwatch%3Fv%3Dabcdefghijk", "Open this instance to verify and watch", new_window: true))
    denied_env = account_surface_env("/admin/bot-protection", mode, locale)
    File.write("#{output}/d7-verify-notice-denied-#{variant}.html", Invidious::Frontend::Standalone.notice(denied_env, 403, "Administrator access required.", "Only instance administrators can change verification settings. Sign out to use another account.", "/login?referer=%2Fadmin%2Fbot-protection", "verify_admin_login", sign_out: true))
    File.write("#{output}/d7-verify-admin-#{variant}.html", standalone_bot_admin_fixture(mode, locale))
    File.write("#{output}/d7-verify-admin-missing-#{variant}.html", standalone_bot_admin_fixture(mode, locale, true))
    File.write("#{output}/d7-verify-admin-failed-#{variant}.html", standalone_bot_admin_fixture(mode, locale, false, true))
  end
  File.write("#{output}/d7-verify-native-id.html", standalone_verification_fixture("light", "id", true))
  File.write("#{output}/d7-verify-cloudflare-id.html", standalone_cloudflare_fixture("light", "id"))
end

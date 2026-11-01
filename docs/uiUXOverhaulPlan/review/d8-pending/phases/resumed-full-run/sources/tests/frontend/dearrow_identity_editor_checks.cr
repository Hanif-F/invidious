# Production identity HTML; only synthetic credentials in the SQLite fixture DB.
def write_identity_editor_fixtures(output)
  path = Invidious::Routes::DeArrowContributions::IDENTITY_PATH
  before_key = CONFIG.dearrow_identity_key
  secret = "FixturePrivateIdentity" + "a" * 50
  {"light", "dark"}.each do |mode|
    {"new", "configured", "setup", "invalid", "expired", "stale", "uncertain", "unavailable"}.each do |kind|
      env = signed_in_env(path)
      prefs = env.get("preferences").as(Preferences)
      prefs.dark_mode = mode
      env.set "preferences", prefs
      env.set "sid", "fixture-session"
      user = env.get("user").as(User)
      CONFIG.dearrow_identity_key = "ab" * 32
      PG_DB.exec("DELETE FROM dearrow_identities WHERE email = ?", user.email)
      Invidious::Database::DeArrowIdentities.import(user.email, secret, CONFIG.dearrow_identity_key) unless kind == "new"
      CONFIG.dearrow_identity_key = "" if kind == "setup"
      fields = {"identity_editor" => "1", "private_id" => "<literal>&private", "confirm_replace" => "on", "browser_profile" => Invidious::BrowserProfiles.account_scope(user.email), "csrf_token" => generate_response("fixture-session", {"POST:dearrow_identity"}, HMAC_KEY), "revision" => Invidious::Database::DeArrowIdentities.snapshot(user.email, HMAC_KEY)[:revision]}
      fields["csrf_token"] = "expired" if kind == "expired"
      fields["browser_profile"] = "earlier-profile" if kind == "stale"
      html = if {"invalid", "expired", "stale"}.includes?(kind)
               post = HTTP::Server::Context.new(HTTP::Request.new("POST", "/dearrow_identity", HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded"}, URI::Params.encode(fields)), HTTP::Server::Response.new(IO::Memory.new))
               %w(user preferences sid csrf_token).each { |key| post.set key, env.get(key) }
               Invidious::BrowserProfiles.publish(post, Invidious::BrowserProfiles.account_scope(user.email))
               Invidious::Routes::DeArrowContributions.identity(post)
             else
               if kind == "uncertain"
                 env.set "identity_error", I18n.translate(prefs.locale, "overhaul_identity_uncertain")
                 env.set "identity_uncertain", true
                 env.set "identity_failed", true
               end
               if kind == "unavailable"
                 PG_DB.exec("ALTER TABLE dearrow_identities RENAME TO dearrow_identity_fixture_saved")
                 begin
                   Invidious::Routes::DeArrowContributions.identity_page(env)
                 ensure
                   PG_DB.exec("ALTER TABLE dearrow_identity_fixture_saved RENAME TO dearrow_identities")
                 end
               else
                 Invidious::Routes::DeArrowContributions.identity_page(env)
               end
             end
      raise "Identity fixture exposed a private ID" if html.as(String).includes?(secret) || html.as(String).includes?("literal&gt;&amp;private") || html.as(String).includes?("<literal>&private")
      File.write("#{output}/d6-identity-#{kind}-#{mode}.html", html)
    end
  end
ensure
  CONFIG.dearrow_identity_key = before_key if before_key
end

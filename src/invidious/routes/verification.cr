module Invidious::Routes::Verification
  alias Protection = Invidious::BotProtection

  def self.status(env)
    Authentication.no_store(env)
    env.response.content_type = "application/json"
    Protection.discovery(Protection.settings, Protection.credential(env)).to_json
  end

  def self.page(env)
    Authentication.no_store(env)
    env.response.content_type = "text/html; charset=utf-8"
    # No Cloudflare permissions on ordinary pages, admin pages, or the API.
    env.response.headers["Content-Security-Policy"] = "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    env.response.headers["Referrer-Policy"] = "no-referrer"
    destination = Protection.safe_return(env.params.query["return"]?)
    native = env.params.query["client"]? == "native"
    policy = Protection.settings
    verified = Protection.validate(Protection.credential(env), policy).is_a?(Int64)
    return env.redirect(destination, 303) if !native && (!policy.enabled || verified)
    ready = Protection.readiness.empty?
    render "src/invidious/views/verification.ecr"
  end

  def self.complete(env, provider = Protection::Siteverify.new)
    Authentication.no_store(env)
    env.response.content_type = "application/json"
    begin
      body = IO::Memory.new
      IO.copy(env.request.body.not_nil!, body, 8193)
      raise ArgumentError.new if body.size > 8192
      input = JSON.parse(body.to_s)
      transport = input["transport"].as_s
      raise ArgumentError.new unless {"browser", "native"}.includes?(transport)
      if transport == "browser"
        origin = env.request.headers["Origin"]?
        allowed = CONFIG.turnstile_allowed_hostnames.map { |host| "https://#{host}" }
        allowed << HOST_URL
        unless origin && allowed.includes?(origin)
          env.response.status_code = 403
          return {error: "invalid_origin"}.to_json
        end
      end
      policy = Protection.settings
      if !policy.enabled
        return {enabled: false, required: false, returnUrl: Protection.safe_return(input["returnUrl"]?.try(&.as_s))}.to_json
      end
      unless Protection.readiness.empty?
        raise Protection::ProviderUnavailable.new
      end
      provider.validate(input["turnstileToken"].as_s)
      # Re-read policy after validation: a concurrent policy change must not issue
      # credentials for the previous policy or resurrect disabled protection.
      current = Protection.settings
      if current != policy
        env.response.status_code = 409
        return {error: "verification_policy_changed", message: "Settings changed. Please retry."}.to_json
      end
      pass = Protection.issue(policy)
      if transport == "native"
        {verificationToken: pass.token, expiresAt: pass.expires_at}.to_json
      else
        Protection.browser_cookie(env, pass)
        {expiresAt: pass.expires_at, returnUrl: Protection.safe_return(input["returnUrl"]?.try(&.as_s))}.to_json
      end
    rescue ex : Protection::InvalidChallenge
      env.response.status_code = 403
      {error: "verification_failed", message: ex.message}.to_json
    rescue ex : Protection::ProviderUnavailable
      env.response.status_code = 503
      {error: "verification_unavailable", message: "Verification provider unavailable. Please retry."}.to_json
    rescue ex : JSON::ParseException | KeyError | TypeCastError | ArgumentError | NilAssertionError
      env.response.status_code = 400
      {error: "invalid_request", message: "Supply turnstileToken and transport (browser or native)."}.to_json
    end
  end

  def self.admin(env)
    Authentication.no_store(env)
    unless user = env.get?("user").try(&.as(User))
      return env.redirect("/login?referer=%2Fadmin%2Fbot-protection", 303)
    end
    unless Authentication.admin?(user)
      env.response.status_code = 403
      return "Administrator access required."
    end
    message = nil
    if env.request.method == "POST"
      unless Authentication.valid_session_csrf?(env)
        env.response.status_code = 403
        return "Invalid CSRF token. Reload this page and retry."
      end
      begin
        Protection.save(env.params.body["enabled"]? == "on", (env.params.body["duration_hours"]? || "").to_i)
        message = "Bot protection settings saved."
      rescue ex : ArgumentError
        env.response.status_code = 400
        message = ex.message
      end
    end
    policy = Protection.settings
    problems = Protection.readiness
    csrf_token = env.get("csrf_token").as(String)
    env.response.content_type = "text/html; charset=utf-8"
    render "src/invidious/views/admin/bot_protection.ecr"
  end
end

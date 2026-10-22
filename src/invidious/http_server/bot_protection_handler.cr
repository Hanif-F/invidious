# Default-deny coverage: newly added dynamic routes are protected automatically.
class Invidious::HttpServer::BotProtectionHandler < Kemal::Handler
  alias Protection = Invidious::BotProtection

  def self.exempt?(request : HTTP::Request) : Bool
    path = request.path
    method = request.method
    if {"GET", "HEAD"}.includes?(method)
      return true if {"/verify", "/api/v1/verification", "/privacy", "/licenses", "/api/v1/stats",
                      "/login", "/signup", "/api/v1/mobile/registration", "/admin/bot-protection"}.includes?(path)
      return true if local_asset?(request)
    elsif method == "POST"
      return true if {"/api/v1/verification/complete", "/login", "/signup", "/signout",
                      "/api/v1/mobile/login", "/api/v1/mobile/register", "/admin/bot-protection"}.includes?(path)
    end
    # These handlers independently authenticate their subscription signatures.
    {"GET", "POST"}.includes?(method) && path.starts_with?("/feed/webhook/")
  end

  # Check actual local files, not extensions: /vi/id/a.jpg still contacts YouTube.
  def self.local_asset?(request : HTTP::Request) : Bool
    return false unless {"GET", "HEAD"}.includes?(request.method)
    decoded = URI.decode(request.path)
    return false unless decoded.starts_with?('/') && !decoded.starts_with?("//") && !decoded.includes?('\\') &&
                        !decoded.each_char.any? { |c| c.ord < 32 || c.ord == 127 } && !decoded.split('/').includes?("..")
    File.file?(File.join("assets", decoded.lchop('/')))
  end

  def self.media_or_api?(path : String) : Bool
    path.starts_with?("/api/") || {"/videoplayback", "/latest_version", "/download", "/companion",
                                   "/vi/", "/sb/", "/s_p/", "/ggpht/", "/yts/", "/pl_c/", "/tvfilm_banner/"}.any? { |prefix| path.starts_with?(prefix) }
  end

  def call(env)
    Protection.strip_credentials(env)
    if self.class.media_or_api?(env.request.path)
      env.response.headers["Access-Control-Allow-Origin"] = "*"
      env.response.headers["Access-Control-Expose-Headers"] = "X-Invidious-Verification-Required"
      if env.request.method == "OPTIONS"
        env.response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"
        env.response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Range, X-CSRF-Token, X-Invidious-Verification"
        env.response.headers["Access-Control-Max-Age"] = "600"
        env.response.status_code = 204
        return
      end
    end
    return call_next(env) if self.class.exempt?(env.request)
    policy = begin
      Protection.settings
    rescue
      # A settings-store failure must never silently disable protection.
      Invidious::Authentication.no_store(env)
      env.response.status_code = 503
      env.response.content_type = "application/json"
      env.response.print({error: "verification_unavailable", message: "Verification is temporarily unavailable. Please retry."}.to_json)
      return
    end
    return call_next(env) unless policy.enabled
    env.response.verification_protected = true
    Invidious::Authentication.no_store(env)
    env.response.headers.add("Vary", "Cookie, X-Invidious-Verification")
    result = Protection.validate(Protection.credential(env), policy)
    if result.is_a?(Int64)
      env.set "verification_expiry", result.to_s
      return call_next(env)
    end
    env.response.headers["X-Invidious-Verification-Required"] = result
    destination = Protection.safe_return(env.request.resource)
    challenge = Protection.challenge_url(destination)
    if env.request.method == "GET" && (env.request.path.starts_with?("/embed/") || env.request.headers["Sec-Fetch-Dest"]? == "iframe")
      env.response.status_code = 403
      env.response.content_type = "text/html; charset=utf-8"
      env.response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors *"
      env.response.print "<!doctype html><meta charset=utf-8><title>Verification required</title><p>Verification is required to play this video. <a target=\"_blank\" rel=\"noopener\" href=\"#{HTML.escape(challenge)}\">Open this instance to verify and watch</a>.</p>"
    elsif browser_navigation?(env)
      env.redirect(challenge, 303)
    else
      env.response.status_code = 403
      env.response.content_type = "application/json"
      env.response.print({error: result, verification: Protection.discovery(policy, nil), challengeUrl: challenge}.to_json)
    end
  end

  private def browser_navigation?(env) : Bool
    return false unless env.request.method == "GET" && !self.class.media_or_api?(env.request.path)
    env.request.headers["Sec-Fetch-Mode"]? == "navigate" ||
      (!env.request.headers.has_key?("Sec-Fetch-Mode") && !!env.request.headers["Accept"]?.try(&.includes?("text/html")))
  end
end

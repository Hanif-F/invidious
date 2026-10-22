# Runs before any dynamic request handler, including unknown-route fallbacks.
class Invidious::HttpServer::RequiredLoginHandler < Kemal::Handler
  def self.exempt?(request : HTTP::Request) : Bool
    path = request.path
    if {"GET", "HEAD"}.includes?(request.method)
      return true if {"/login", "/signup", "/verify", "/api/v1/verification",
                      "/api/v1/mobile/registration", "/feed/private"}.includes?(path)
    elsif request.method == "POST"
      return true if {"/login", "/signup", "/api/v1/mobile/login", "/api/v1/mobile/register",
                      "/api/v1/tv/pairing/start", "/api/v1/tv/pairing/token",
                      "/api/v1/verification/complete"}.includes?(path)
    end
    # These routes verify their own feed credentials/signatures. They grant no
    # access to any other endpoint and must not establish a browser identity.
    token = path.lchop("/feed/webhook/")
    {"GET", "POST"}.includes?(request.method) && path.starts_with?("/feed/webhook/") && !token.empty? && !token.includes?('/')
  end

  def call(env)
    return call_next(env) unless CONFIG.login_required
    return call_next(env) if Invidious::HttpServer::BotProtectionHandler.local_asset?(env.request)

    env.response.login_protected = true
    Invidious::Authentication.no_store(env)
    media_or_api = Invidious::HttpServer::BotProtectionHandler.media_or_api?(env.request.path)
    # BotProtectionHandler provides content-free CORS preflight responses.
    return call_next(env) if media_or_api && env.request.method == "OPTIONS"
    return call_next(env) if self.class.exempt?(env.request)

    begin
      user = Invidious::Authentication.resolve_user(env, bearer: media_or_api)
    rescue InfoException | JSON::ParseException | KeyError | TypeCastError | ArgumentError
      user = nil
    end
    return call_next(env) if user

    login_url = Invidious::Authentication.login_url(env.request.resource)
    if media_or_api
      env.response.headers["Access-Control-Allow-Origin"] = "*"
      env.response.status_code = 401
      env.response.content_type = "application/json"
      env.response.print({error: "login_required", loginUrl: login_url}.to_json)
    else
      env.redirect(login_url, 303)
    end
  end
end

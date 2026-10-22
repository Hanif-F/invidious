require "socket"

module Invidious::Authentication
  extend self

  def admin?(user : User) : Bool
    CONFIG.admins.any? { |name| name.downcase == user.username.downcase }
  end

  def no_store(env)
    env.response.headers["Cache-Control"] = "private, no-store"
    env.response.headers["Pragma"] = "no-cache"
  end

  # Resolve identity once per request. Scope and CSRF authorization remain the
  # responsibility of AuthHandler and the individual account routes.
  def resolve_user(env, *, bearer = false) : User?
    return env.get?("authentication_user").try(&.as(User)) if env.get?("authentication_resolved")
    env.set "header_x-forwarded-host", env.request.headers["X-Forwarded-Host"]?

    if bearer && (authorization = env.request.headers["Authorization"]?)
      env.set "authentication_bearer", true
      raise InfoException.new("Invalid bearer token") unless authorization.starts_with?("Bearer ") && authorization.bytesize <= 16_384
      token = JSON.parse(URI.decode_www_form(authorization.lchop("Bearer ")))
      session = token["session"].as_s
      # Form/CSRF credentials must never become general instance access passes.
      raise InfoException.new("Invalid bearer token") if !session.starts_with?("v1:") || token["nonce"]?
      scopes, _, _ = validate_request(token, session, env.request, HMAC_KEY, check_scope: false)
      env.set "session", session
      env.set "scopes", scopes
    elsif sid = env.request.cookies["SID"]?.try(&.value)
      if sid.starts_with?("v1:")
        clear_session(env)
        env.set "authentication_resolved", true
        return
      end
      session = sid
      env.set "sid", sid
      env.set "session", sid
    end

    if session && (email = Database::SessionIDs.select_email(session))
      user = Database::Users.select(email: email)
    end
    if user
      env.set "authentication_user", user
      # Bearer identity is published to account routes only after AuthHandler
      # checks their scopes. Passing the instance gate grants ordinary content
      # access, not private playlist reads or account-specific API behavior.
      env.set "user", user unless env.get?("authentication_bearer")
    elsif session && !env.get?("authentication_bearer")
      clear_session(env)
    end
    env.set "authentication_resolved", true
    user
  end

  def safe_login_return(value : String?) : String
    destination = BotProtection.safe_return(value)
    return "/" if {"/login", "/signup"}.includes?(URI.parse(URI.decode(destination)).path)
    destination
  rescue
    "/"
  end

  def login_url(destination : String) : String
    "/login?referer=#{URI.encode_www_form(safe_login_return(destination))}"
  end

  def login_referer(env) : String
    safe_login_return(env.params.query["referer"]? || get_referer(env, "/feed/subscriptions", unroll: false))
  end

  # Companion receives playback headers, never the instance's account secrets.
  def proxy_headers(env) : HTTP::Headers
    headers = env.request.headers.dup
    {"Authorization", "Cookie", "X-CSRF-Token"}.each { |name| headers.delete(name) }
    headers
  end

  # Pass an explicit token when streaming multipart data; do not consume its body here.
  def valid_session_csrf?(env, token : String?) : Bool
    sid = env.get?("sid").try(&.as(String)) || env.request.cookies["SID"]?.try(&.value)
    return false if !sid || sid.starts_with?("v1:")
    validate_request(token, sid, env.request, HMAC_KEY)
    true
  rescue
    false
  end

  def valid_session_csrf?(env) : Bool
    token = env.request.headers["X-CSRF-Token"]?
    token ||= env.params.body["csrf_token"]? if env.request.headers["Content-Type"]?.try(&.starts_with?("application/x-www-form-urlencoded"))
    valid_session_csrf?(env, token)
  end

  def cookie_domain(env) : String?
    host = env.get?("header_x-forwarded-host").try(&.as?(String))
    CONFIG.alternative_domains.find { |domain| domain == host } || CONFIG.domain
  end

  def set_session(env, sid : String)
    env.response.cookies << User::Cookies.sid(cookie_domain(env), sid)
    BrowserProfiles.publish(env, BrowserProfiles.account_scope(Database::SessionIDs.select_email(sid).not_nil!))
    env.response.cookies << HTTP::Cookie.new("AUTH_CSRF", "", path: "/", expires: Time.utc(1990, 1, 1), http_only: true)
  end

  def clear_session(env)
    env.response.cookies << User::Cookies.sid(cookie_domain(env), "").tap(&.expires=(Time.unix(0)))
    env.response.cookies << HTTP::Cookie.new("AUTH_CSRF", "", path: "/", expires: Time.unix(0), http_only: true)
    BrowserProfiles.publish(env, "guest")
  end

  def form_token(env, path : String) : String
    no_store(env)
    binding = Random::Secure.hex(32)
    env.response.cookies << HTTP::Cookie.new("AUTH_CSRF", binding, path: "/", http_only: true,
      secure: User::Cookies.secure?(cookie_domain(env)), samesite: HTTP::Cookie::SameSite::Lax, expires: Time.utc + 1.hour)
    generate_response(binding, {"POST:#{path}"}, HMAC_KEY, 1.hour)
  end

  def validate_form(env)
    no_store(env)
    binding = env.request.cookies["AUTH_CSRF"]?.try(&.value)
    raise InfoException.new("Invalid form. Please try again.") unless binding && binding.matches?(/\A[0-9a-f]{64}\z/)
    validate_request(env.params.body["csrf_token"]?, binding, env.request, HMAC_KEY)
  end

  def ip_value(address : String) : Tuple(UInt128, Int32)?
    if fields = Socket::IPAddress.parse_v4_fields?(address)
      {fields.reduce(0_u128) { |value, part| (value << 8) | part.to_u128 }, 32}
    elsif fields = Socket::IPAddress.parse_v6_fields?(address)
      {fields.reduce(0_u128) { |value, part| (value << 16) | part.to_u128 }, 128}
    end
  end

  def trusted?(address : String) : Bool
    ip = ip_value(address)
    return false unless ip
    CONFIG.auth_trusted_proxies.any? do |cidr|
      parts = cidr.split('/', 2)
      network = ip_value(parts[0])
      next false unless network && network[1] == ip[1]
      prefix = parts.size == 2 ? parts[1].to_i? : network[1]
      next false unless prefix
      next false unless prefix >= 0 && prefix <= network[1]
      prefix == 0 || (network[0] >> (network[1] - prefix)) == (ip[0] >> (ip[1] - prefix))
    end
  end

  def client_ip(env) : String
    peer = env.request.remote_address.as?(Socket::IPAddress).try(&.address) || "local"
    return peer unless trusted?(peer)
    chain = (env.request.headers["X-Forwarded-For"]? || "").split(',').map(&.strip)
    return peer unless chain.size <= 20 && chain.all? { |address| Socket::IPAddress.valid?(address) }
    chain.reverse_each do |address|
      return Socket::IPAddress.new(address, 0).address unless trusted?(address)
    end
    peer
  end

  def throttle(env, username : String? = nil, signup = false) : Bool
    ip = client_ip(env)
    waits = [] of Int32
    if wait = Database::Accounts.throttle("auth-ip:#{ip}", 100, 900)
      waits << wait
    end
    if username
      if wait = Database::Accounts.throttle("auth-user:#{username.downcase}", 10, 900)
        waits << wait
      end
    end
    if signup
      if wait = Database::Accounts.throttle("signup-ip:#{ip}", 10, 3600)
        waits << wait
      end
    end
    return false if waits.empty?
    env.response.status_code = 429
    env.response.headers["Retry-After"] = waits.max.to_s
    true
  end
end

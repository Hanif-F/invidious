require "socket"

module Invidious::Authentication
  extend self

  def no_store(env)
    env.response.headers["Cache-Control"] = "private, no-store"
    env.response.headers["Pragma"] = "no-cache"
  end

  # Pass an explicit token when streaming multipart data; do not consume its body here.
  def valid_session_csrf?(env, token : String?) : Bool
    sid = env.get?("sid").try(&.as(String)) || env.request.cookies["SID"]?.try(&.value)
    return false unless sid && !sid.starts_with?("v1:")
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
    if cookie = env.request.cookies["PREFS"]?
      cookie.expires = Time.utc(1990, 1, 1)
      cookie.path = "/"
      env.response.cookies << cookie
    end
    env.response.cookies << HTTP::Cookie.new("AUTH_CSRF", "", path: "/", expires: Time.utc(1990, 1, 1), http_only: true)
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

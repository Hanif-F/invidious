module Invidious::Routes::API::V1::TvPairing
  extend self

  def error(env, status : Int32, code : String)
    env.response.status_code = status
    {error: code}.to_json
  end

  def unavailable(env) : String?
    Authentication.no_store(env)
    env.response.content_type = "application/json"
    return error(env, 403, "login_disabled") unless CONFIG.login_enabled
    {% if flag?(:api_only) %}
      return error(env, 503, "pairing_unavailable")
    {% end %}
    return error(env, 503, "pairing_unavailable") unless URI.parse(HOST_URL).scheme == "https"
    nil
  end

  def limited(env, rules : Array(Tuple(String, Int32, Int32)), check_only = false) : Bool
    waits = rules.compact_map do |key, limit, seconds|
      check_only ? Database::Accounts.throttle_wait(key, limit) : Database::Accounts.throttle(key, limit, seconds)
    end
    return false if waits.empty?
    env.response.status_code = 429
    env.response.headers["Retry-After"] = waits.max.to_s
    true
  end

  def verification_uri(env) : String
    # Never reflect an arbitrary Host/forwarded host into the QR payload. The
    # canonical external origin and explicitly configured aliases are trusted.
    canonical = URI.parse(HOST_URL)
    authority = canonical.authority
    candidates = [env.request.headers["Host"]?]
    peer = env.request.remote_address.as?(Socket::IPAddress).try(&.address)
    if peer && Authentication.trusted?(peer)
      candidates.unshift(env.request.headers["X-Forwarded-Host"]?)
    end
    allowed = CONFIG.alternative_domains + [authority]
    selected = candidates.compact.find { |host| allowed.includes?(host) }
    selected ? "#{canonical.scheme}://#{selected}/tv" : "#{HOST_URL}/tv"
  end

  def start(env)
    if failure = unavailable(env)
      return failure
    end
    begin
      fields = Mobile.read_json(env)
      raise ArgumentError.new("Expected an empty object") unless fields.empty?
    rescue JSON::ParseException | TypeCastError | ArgumentError
      return error(env, 400, "invalid_request")
    end
    ip = Authentication.client_ip(env)
    return {error: "rate_limited"}.to_json if limited(env, [{"tv-start-minute:#{ip}", 5, 60}, {"tv-start-hour:#{ip}", 20, 3600}])
    grant = Database::TvPairings.start
    verification = verification_uri(env)
    grant.merge({verificationUri: verification, verificationUriComplete: "#{verification}?user_code=#{grant[:userCode]}"}).to_json
  end

  def token(env)
    if failure = unavailable(env)
      return failure
    end
    begin
      fields = Mobile.read_json(env)
      device = fields["deviceCode"].as_s
      raise ArgumentError.new("Invalid device code") unless fields.size == 1 && device.matches?(/\A[A-Za-z0-9_-]{43}\z/)
    rescue JSON::ParseException | TypeCastError | KeyError | ArgumentError
      return error(env, 400, "invalid_request")
    end
    result = Database::TvPairings.poll(device)
    if result.is_a?(String)
      if result == "invalid_grant"
        ip = Authentication.client_ip(env)
        return {error: "rate_limited"}.to_json if limited(env, [{"tv-invalid-device:#{ip}", 30, 60}])
      end
      return error(env, 400, result)
    end
    result.to_json
  end
end

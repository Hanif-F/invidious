require "base64"

# Independent of account authentication. No credential is ever sent to YouTube.
module Invidious::BotProtection
  extend self

  COOKIE  = "IV_VERIFIED"
  HEADER  = "X-Invidious-Verification"
  ACTION  = "instance_access"
  PURPOSE = "invidious:instance-access:v1"

  record Settings, enabled : Bool, duration_hours : Int32, revision : Int64
  record Pass, token : String, expires_at : Int64

  class ProviderUnavailable < Exception; end

  class InvalidChallenge < Exception; end

  @@mutex = Mutex.new
  @@settings : Settings? = nil
  @@refreshed_at = Time.monotonic - 2.seconds

  def settings : Settings
    @@mutex.synchronize do
      if @@settings.nil? || Time.monotonic - @@refreshed_at >= 1.second
        enabled, hours, revision = PG_DB.query_one(
          "SELECT enabled, duration_hours, revision FROM bot_protection_settings WHERE singleton = true",
          as: {Bool, Int32, Int64})
        @@settings = Settings.new(enabled, hours, revision)
        @@refreshed_at = Time.monotonic
      end
      @@settings.not_nil!
    end
  end

  def save(enabled : Bool, hours : Int32) : Settings
    raise ArgumentError.new("Choose 1, 12, or 24 hours.") unless {1, 12, 24}.includes?(hours)
    if enabled && !(problems = readiness).empty?
      raise ArgumentError.new(problems.join(" "))
    end
    @@mutex.synchronize do
      # One atomic write also serializes competing administrators/processes.
      revision = PG_DB.query_one(<<-SQL, enabled, hours, as: Int64)
        UPDATE bot_protection_settings SET enabled = $1, duration_hours = $2,
          revision = revision + CASE WHEN enabled <> $1 OR duration_hours <> $2 THEN 1 ELSE 0 END
        WHERE singleton = true RETURNING revision
        SQL
      @@settings = Settings.new(enabled, hours, revision)
      @@refreshed_at = Time.monotonic
      @@settings.not_nil!
    end
  end

  def readiness : Array(String)
    problems = [] of String
    problems << "Configure the Turnstile site key and secret key." if CONFIG.turnstile_site_key.empty? || CONFIG.turnstile_secret_key.empty?
    hosts = CONFIG.turnstile_allowed_hostnames
    domain = CONFIG.domain
    if hosts.empty? || hosts.any? { |host| !host.matches?(/\A[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\z/) } || !domain || !hosts.includes?(domain)
      problems << "Configure exact allowed hostnames, including the instance domain."
    end
    problems << "Configure HTTPS (https_only: true)." unless CONFIG.https_only || Kemal.config.ssl
    problems << "Configure a persistent turnstile_signing_key (or hmac_key) of at least 32 characters." if signing_key.bytesize < 32
    if !CONFIG.turnstile_companion_private || CONFIG.invidious_companion.empty? || CONFIG.invidious_companion.any? { |c| !c.builtin_proxy || c.public_url.to_s != "/companion" }
      problems << "Keep Companion private and use only the built-in /companion proxy; confirm turnstile_companion_private."
    end
    problems
  end

  def audience : String
    # HOST_URL is generated from deployment configuration, never request headers.
    HOST_URL
  end

  private def signing_key : String
    CONFIG.turnstile_signing_key.empty? ? HMAC_KEY : CONFIG.turnstile_signing_key
  end

  private def signature(payload : String) : String
    key = OpenSSL::HMAC.digest(:sha256, signing_key, PURPOSE)
    Base64.urlsafe_encode(OpenSSL::HMAC.digest(:sha256, key, payload), padding: false)
  end

  def issue(policy : Settings, now = Time.utc.to_unix) : Pass
    expiry = now + policy.duration_hours * 3600
    payload = Base64.urlsafe_encode({v: 1, purpose: PURPOSE, id: Random::Secure.hex(16), aud: audience,
                                     iat: now, exp: expiry, revision: policy.revision}.to_json, padding: false)
    Pass.new("#{payload}.#{signature(payload)}", expiry)
  end

  # Returns an expiry, or a stable failure code. Expiry is distinguished only after
  # authenticating the signature so forged tokens cannot dictate response state.
  def validate(token : String?, policy : Settings, now = Time.utc.to_unix) : Int64 | String
    return "verification_required" unless token && token.bytesize <= 2048
    parts = token.split('.')
    return "verification_required" unless parts.size == 2 && parts[1].bytesize == 43
    return "verification_required" unless Crypto::Subtle.constant_time_compare(signature(parts[0]), parts[1])
    claims = JSON.parse(Base64.decode_string(parts[0]))
    issued = claims["iat"].as_i64
    expiry = claims["exp"].as_i64
    return "verification_required" unless claims["v"].as_i == 1 && claims["purpose"].as_s == PURPOSE &&
                                          claims["aud"].as_s == audience && claims["revision"].as_i64 == policy.revision &&
                                          claims["id"].as_s.matches?(/\A[0-9a-f]{32}\z/) && issued <= now &&
                                          expiry > issued && expiry - issued == policy.duration_hours * 3600
    return "verification_expired" if expiry <= now
    expiry
  rescue
    "verification_required"
  end

  def credential(env) : String?
    env.get?("verification_credential").try(&.as(String)) ||
      env.request.headers[HEADER]? || env.request.cookies[COOKIE]?.try(&.value)
  end

  def strip_credentials(env)
    if value = env.request.headers[HEADER]? || env.request.cookies[COOKIE]?.try(&.value)
      env.set "verification_credential", value
    end
    env.request.headers.delete(HEADER)
    if cookies = env.request.headers["Cookie"]?
      filtered = cookies.split(';').reject { |part| part.strip.split('=', 2).first == COOKIE }.join(';')
      if filtered.empty?
        env.request.headers.delete("Cookie")
      else
        env.request.headers["Cookie"] = filtered
      end
    end
  end

  def browser_cookie(env, pass : Pass)
    env.response.cookies << HTTP::Cookie.new(COOKIE, pass.token, path: "/", secure: true, http_only: true,
      samesite: HTTP::Cookie::SameSite::Lax, expires: Time.unix(pass.expires_at))
  end

  # The return destination is strictly local. Reject encoded separators/control
  # characters as well as raw ones; never use an untrusted Referer or Host.
  def safe_return(value : String?) : String
    return "/" unless value && value.bytesize <= 4096
    decoded = value
    3.times do
      return "/" unless decoded.starts_with?('/') && !decoded.starts_with?("//") &&
                        !decoded.includes?('\\') && !decoded.each_char.any? { |c| c.ord < 32 || c.ord == 127 }
      next_value = URI.decode(decoded)
      break if next_value == decoded
      decoded = next_value
    end
    uri = URI.parse(value)
    return "/" if uri.host || uri.scheme || uri.path == "/verify" || uri.path.starts_with?("/api/v1/verification")
    value
  rescue
    "/"
  end

  def challenge_url(destination : String = "/") : String
    "/verify?return=#{URI.encode_www_form(safe_return(destination))}"
  end

  def discovery(policy : Settings, credential : String?)
    result = validate(credential, policy)
    {enabled: policy.enabled, required: policy.enabled && !result.is_a?(Int64), verified: result.is_a?(Int64),
     expiresAt: result.is_a?(Int64) ? result : nil, duration: policy.duration_hours * 3600,
     siteKey: CONFIG.turnstile_site_key, challengeUrl: "/verify?client=native", verificationHeader: HEADER}
  end

  class Siteverify
    def initialize(@request : Proc(String, HTTP::Client::Response)? = nil)
    end

    private def request(body : String) : HTTP::Client::Response
      client = HTTP::Client.new(URI.parse("https://challenges.cloudflare.com"))
      client.connect_timeout = 3.seconds
      client.read_timeout = 5.seconds
      client.write_timeout = 3.seconds
      result = ::Channel(HTTP::Client::Response | Exception).new(1)
      spawn do
        begin
          response = if mock = @request
                       mock.call(body)
                     else
                       client.exec("POST", "/turnstile/v0/siteverify", HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded"}, body)
                     end
          result.send(response)
        rescue ex
          result.send(ex)
        ensure
          client.close
        end
      end
      select
      when response = result.receive
        raise ProviderUnavailable.new if response.is_a?(Exception)
        response
      when timeout(8.seconds)
        client.close
        raise ProviderUnavailable.new
      end
    end

    def validate(token : String)
      raise InvalidChallenge.new("Please complete verification again.") if token.empty? || token.bytesize > 2048
      body = URI::Params.encode({"secret" => CONFIG.turnstile_secret_key, "response" => token})
      begin
        response = request(body)
        raise ProviderUnavailable.new unless response.status_code == 200
        result = JSON.parse(response.body)
        raise ProviderUnavailable.new if result["error-codes"]?.try(&.as_a.any? { |code| code.as_s == "internal-error" })
        accepted = result["success"].as_bool && result["action"]?.try(&.as_s) == ACTION &&
                   CONFIG.turnstile_allowed_hostnames.includes?(result["hostname"]?.try(&.as_s) || "")
      rescue ex : ProviderUnavailable
        raise ex
      rescue
        raise ProviderUnavailable.new("Verification provider unavailable. Please retry.")
      end
      unless accepted
        raise InvalidChallenge.new("Verification failed or expired. Please retry.")
      end
    end
  end
end

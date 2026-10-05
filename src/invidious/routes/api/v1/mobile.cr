module Invidious::Routes::API::V1::Mobile
  # Account administration uses dedicated, password-confirmed routes, not generic token minting.
  SCOPES = %w(GET:preferences PATCH:preferences PATCH:chat_preferences GET;PUT:chat_timing/* GET:feed GET:feed/rss GET:subscriptions GET:subscriptions/search GET:subscriptions/export
    PUT;DELETE:saved_playlists/*
    GET:blocked_channels POST;DELETE:blocked_channels/*
    POST;DELETE:subscriptions/* GET:history POST;DELETE:history/* DELETE:history
    GET:playback GET;PUT;DELETE:playback/* DELETE:playback
    GET;POST:playlists GET;PATCH;DELETE:playlists/* POST:playlists/*
    POST:tokens/unregister GET;POST:dearrow/* PUT:dearrow/identity
    POST:account/username POST:account/password POST:account/delete
    GET:account/sessions POST:account/sessions/revoke POST:account/tokens)

  def self.registration(env)
    env.response.content_type = "application/json"
    Invidious::Authentication.no_store(env)
    enabled = CONFIG.login_enabled && CONFIG.registration_enabled
    # Challenge rendering is relatively expensive; bound anonymous issuance separately.
    if enabled && CONFIG.captcha_enabled
      if wait = Database::Accounts.throttle("mobile-captcha:#{Authentication.client_ip(env)}", 60, 3600)
        env.response.headers["Retry-After"] = wait.to_s
        return error_json(429, "Too many attempts. Try again later.")
      end
    end
    captcha = enabled && CONFIG.captcha_enabled ? User::Captcha.generate_image(HMAC_KEY, "POST:api/v1/mobile/register") : nil
    {loginEnabled: CONFIG.login_enabled, registrationEnabled: enabled,
     captcha: captcha.try { |value| {image: value[:question], token: value[:tokens][0]} }}.to_json
  end

  def self.register(env)
    env.response.content_type = "application/json"
    Authentication.no_store(env)
    return error_json(403, "Sign-in is disabled on this instance.") unless CONFIG.login_enabled
    return error_json(403, "Registration is disabled on this instance.") unless CONFIG.registration_enabled
    begin
      data = read_json(env)
      username = data["username"].as_s
      password = data["password"].as_s
      confirmation = data["passwordConfirmation"].as_s
    rescue
      return error_json(400, "Invalid registration request.")
    end
    return error_json(429, "Too many attempts. Try again later.") if Authentication.throttle(env, username.byte_slice(0, 254), true)
    error = Credentials.username_error(username) || Credentials.password_error(password)
    error ||= "New passwords must match" unless password == confirmation
    return error_json(400, error) if error
    if CONFIG.captcha_enabled
      begin
        answer = OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, data["captchaAnswer"].as_s.lstrip('0'))
        validate_request(data["captchaToken"].as_s, answer, env.request, HMAC_KEY)
      rescue
        return error_json(400, "Incorrect or expired CAPTCHA. Refresh the challenge.")
      end
    end
    Database::Accounts.register_mobile(username, password).to_json
  rescue ex : PQ::PQError
    raise ex unless ex.field_message(:code) == "23505"
    error_json(409, "Username is already taken.")
  end

  def self.read_json(env) : Hash(String, JSON::Any)
    body = env.request.body
    raise ArgumentError.new("Missing JSON") unless body && env.request.headers["Content-Type"]?.try(&.split(';').first.strip.downcase) == "application/json"
    output = IO::Memory.new
    buffer = Bytes.new(1024)
    while (count = body.read(buffer)) > 0
      output.write(buffer[0, count])
      raise ArgumentError.new("JSON too large") if output.size > 16_384
    end
    JSON.parse(output.to_s).as_h
  end

  def self.login(env)
    env.response.content_type = "application/json"
    Invidious::Authentication.no_store(env)
    return error_json(403, "Sign-in is disabled on this instance.") unless CONFIG.login_enabled
    begin
      data = read_json(env)
      username = data["username"].as_s
      password = data["password"].as_s
      raise "Invalid credentials" unless 0 < username.bytesize <= 254 && 0 < password.bytesize <= 4096
    rescue
      return error_json(400, "Invalid sign-in request.")
    end
    return error_json(429, "Too many attempts. Try again later.") if Invidious::Authentication.throttle(env, username)
    if result = Invidious::Database::Accounts.authenticate_mobile(username, password)
      result.to_json
    else
      error_json(401, "Incorrect username or password.")
    end
  end
end

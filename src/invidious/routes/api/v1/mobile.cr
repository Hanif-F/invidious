module Invidious::Routes::API::V1::Mobile
  # No account export/import, token minting, or wildcard access to future APIs.
  SCOPES = %w(GET:preferences PATCH:preferences GET:feed GET:subscriptions GET:subscriptions/search
    GET:blocked_channels POST;DELETE:blocked_channels/*
    POST;DELETE:subscriptions/* GET:history POST;DELETE:history/* DELETE:history
    GET:playback GET;PUT;DELETE:playback/* DELETE:playback
    GET;POST:playlists GET;PATCH;DELETE:playlists/* POST:playlists/*
    POST:tokens/unregister GET;POST:dearrow/* PUT:dearrow/identity)

  def self.read_json(env) : Hash(String, JSON::Any)
    body = env.request.body
    raise "Missing JSON" unless body && env.request.headers["Content-Type"]?.try(&.split(';').first.strip.downcase) == "application/json"
    output = IO::Memory.new
    buffer = Bytes.new(1024)
    while (count = body.read(buffer)) > 0
      output.write(buffer[0, count])
      raise "JSON too large" if output.size > 16_384
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

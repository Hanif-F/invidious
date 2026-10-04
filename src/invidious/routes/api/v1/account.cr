module Invidious::Routes::API::V1::Account
  def self.perform(env, body = true, &)
    env.response.content_type = "application/json"
    Authentication.no_store(env)
    data = body ? Mobile.read_json(env) : {} of String => JSON::Any
    if body && Authentication.throttle(env, env.get("user").as(User).username)
      return error_json(429, "Too many attempts. Try again later.")
    end
    yield data, env.get("user").as(User).email, env.get("session").as(String)
  rescue ex : Database::Accounts::PasswordError
    env.response.status_code = 401
    {error: ex.message, code: "invalid_password"}.to_json
  rescue ex : Database::Accounts::SessionError
    env.response.status_code = 401
    {error: ex.message, code: "session_expired"}.to_json
  rescue ex : PQ::PQError
    raise ex unless ex.field_message(:code) == "23505"
    error_json(409, "Username is already taken.")
  rescue ex : KeyError | TypeCastError | JSON::ParseException | ArgumentError
    error_json(400, "Invalid account request.")
  end

  def self.username(env)
    perform(env) do |data, email, sid|
      username = data["username"].as_s
      if error = Credentials.username_error(username)
        return error_json(400, error)
      end
      Database::Accounts.change_mobile(email, sid, data["password"].as_s, username: username).to_json
    end
  end

  def self.password(env)
    perform(env) do |data, email, sid|
      password = data["newPassword"].as_s
      if error = Credentials.password_error(password)
        return error_json(400, error)
      end
      return error_json(400, "New passwords must match") unless password == data["passwordConfirmation"].as_s
      Database::Accounts.change_mobile(email, sid, data["password"].as_s, new_password: password).to_json
    end
  end

  def self.delete(env)
    perform(env) do |data, email, sid|
      # delete verifies the password and active session under the account row lock.
      unless Database::Accounts.delete(email, sid, data["password"].as_s, strict: true)
        raise Database::Accounts::PasswordError.new("Incorrect current password.")
      end
      env.response.status_code = 204
      ""
    end
  end

  def self.sessions(env)
    perform(env, false) { |_, email, sid| Database::Accounts.managed_sessions(email, sid).to_json }
  end

  def self.revoke(env)
    perform(env) do |data, email, sid|
      return error_json(404, "Session no longer exists.") unless Database::Accounts.revoke_managed(email, sid, data["id"].as_s)
      env.response.status_code = 204
      ""
    end
  end

  def self.token(env)
    perform(env) do |data, email, sid|
      scopes = data["scopes"].as_a.map(&.as_s).uniq
      valid = scopes.size.in?(1..64) && scopes.all? do |scope|
        scope.bytesize <= 256 && scope.matches?(/\A(?:(?:GET|POST|PUT|HEAD|DELETE|PATCH|OPTIONS)(?:;(?:GET|POST|PUT|HEAD|DELETE|PATCH|OPTIONS))*)?:[a-z0-9_.*\/-]+\z/)
      end
      return error_json(400, "Select valid API permissions.") unless valid
      expiry = data["expiresAt"]?
      expires = expiry && !expiry.raw.nil? ? Time.unix(expiry.as_i64) : nil
      return error_json(400, "Expiry must be in the future.") if expires && expires <= Time.utc
      # Unlike generic delegated token registration, password verification authorizes
      # the selected permissions directly. The caller does not receive wildcard access.
      token = Database::Accounts.authorize_mobile_token(email, sid, data["password"].as_s, scopes, expires)
      {accessToken: token, expiresAt: expires.try(&.to_unix)}.to_json
    end
  end
end

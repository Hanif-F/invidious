{% skip_file if flag?(:api_only) %}

module Invidious::Routes::Account
  extend self

  def get_account(env, error : String? = nil)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale
    return env.redirect "/login?referer=%2Faccount" unless env.get?("user")
    user = env.get("user").as(User)
    sid = env.get("sid").as(String)
    username_token = generate_response(sid, {"POST:account/username"}, HMAC_KEY, 1.hour)
    password_token = generate_response(sid, {"POST:change_password"}, HMAC_KEY, 1.hour)
    templated "user/account"
  end

  def get_change_password(env)
    get_account(env)
  end

  def post_username(env)
    change_credentials(env, true)
  end

  def post_change_password(env)
    change_credentials(env, false)
  end

  def change_credentials(env, rename : Bool)
    Authentication.no_store(env)
    return env.redirect "/login?referer=%2Faccount" unless env.get?("user")
    user = env.get("user").as(User)
    sid = env.get("sid").as(String)
    begin
      validate_request(env.params.body["csrf_token"]?, sid, env.request, HMAC_KEY)
    rescue
      env.response.status_code = 400
      return get_account(env, "Invalid form. Please try again.")
    end
    if Authentication.throttle(env, user.username)
      return get_account(env, "Too many attempts. Please try again later.")
    end
    password = env.params.body["password"]? || ""
    username = rename ? (env.params.body["username"]? || "") : nil
    new_password = rename ? nil : (env.params.body["new_password[0]"]? || "")
    error = username.try { |value| Credentials.username_error(value) }
    if new_password
      error ||= Credentials.password_error(new_password)
      error ||= "New passwords must match" unless new_password == env.params.body["new_password[1]"]?
    end
    unless error
      begin
        if new_sid = Database::Accounts.change(user.email, sid, password, username, new_password)
          Authentication.set_session(env, new_sid)
          return env.redirect "/account?updated=true"
        end
        error = "Incorrect password"
      rescue ex : PQ::PQError
        raise ex unless ex.field_message(:code) == "23505"
        error = "Username is already taken."
      end
    end
    env.response.status_code = 400
    get_account(env, error)
  end

  # -------------------
  #  Account deletion
  # -------------------

  # Show the account deletion confirmation prompt (GET request)
  def get_delete(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    if !user
      return env.redirect referer
    end

    user = user.as(User)
    sid = sid.as(String)
    csrf_token = generate_response(sid, {":delete_account"}, HMAC_KEY)

    templated "user/delete_account"
  end

  # Handle the account deletion (POST request)
  def post_delete(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    if !user
      return env.redirect referer
    end

    user = user.as(User)
    sid = sid.as(String)
    token = env.params.body["csrf_token"]?

    begin
      validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue ex
      return error_template(400, ex)
    end

    if Authentication.throttle(env, user.username)
      return error_template(429, "Too many attempts. Please try again later.")
    end
    unless Database::Accounts.delete(user.email, sid, env.params.body["password"]? || "")
      return error_template(401, "Incorrect password")
    end

    env.request.cookies.each do |cookie|
      cookie.expires = Time.utc(1990, 1, 1)
      env.response.cookies << cookie
    end

    env.redirect referer
  end

  # -------------------
  #  Clear history
  # -------------------

  # Show the watch history deletion confirmation prompt (GET request)
  def get_clear_history(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    if !user
      return env.redirect referer
    end

    user = user.as(User)
    sid = sid.as(String)
    csrf_token = generate_response(sid, {":clear_watch_history"}, HMAC_KEY)

    templated "user/clear_watch_history"
  end

  # Handle the watch history clearing (POST request)
  def post_clear_history(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    if !user
      return env.redirect referer
    end

    user = user.as(User)
    sid = sid.as(String)
    token = env.params.body["csrf_token"]?

    begin
      validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue ex
      return error_template(400, ex)
    end

    Invidious::Database::Users.clear_watch_history(user)
    Invidious::Database::PlaybackPositions.clear(user.email)
    env.redirect referer
  end

  # -------------------
  #  Authorize tokens
  # -------------------

  # Show the "authorize token?" confirmation prompt (GET request)
  def get_authorize_token(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    if !user
      return env.redirect "/login?referer=#{URI.encode_path_segment(env.request.resource)}"
    end

    user = user.as(User)
    sid = sid.as(String)
    csrf_token = generate_response(sid, {":authorize_token"}, HMAC_KEY)

    scopes = env.params.query["scopes"]?.try &.split(",")
    scopes ||= [] of String

    callback_url = env.params.query["callback_url"]?
    if callback_url
      callback_url = URI.parse(callback_url)
    end

    expire = env.params.query["expire"]?.try &.to_i?

    templated "user/authorize_token"
  end

  # Handle token authorization (POST request)
  def post_authorize_token(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    if !user
      return env.redirect referer
    end

    user = env.get("user").as(User)
    sid = sid.as(String)
    token = env.params.body["csrf_token"]?

    begin
      validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue ex
      return error_template(400, ex)
    end

    scopes = env.params.body.select { |k, _| k.match(/^scopes\[\d+\]$/) }.map { |_, v| v }
    callback_url = env.params.body["callbackUrl"]?
    expire = env.params.body["expire"]?.try &.to_i?

    access_token = generate_token(user.email, scopes, expire, HMAC_KEY, sid)

    if callback_url
      access_token = URI.encode_www_form(access_token)
      url = URI.parse(callback_url)

      if url.query
        query = HTTP::Params.parse(url.query.not_nil!)
      else
        query = HTTP::Params.new
      end

      query["token"] = access_token
      query["username"] = user.username
      url.query = query.to_s

      env.redirect url.to_s
    else
      csrf_token = ""
      env.set "access_token", access_token
      templated "user/authorize_token"
    end
  end

  # -------------------
  #  Manage tokens
  # -------------------

  # Show the token manager page (GET request)
  def token_manager(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env, "/subscription_manager")

    if !user
      return env.redirect referer
    end

    user = user.as(User)
    tokens = Invidious::Database::SessionIDs.select_all(user.email)

    templated "user/token_manager"
  end

  # -------------------
  #  AJAX for tokens
  # -------------------

  # Handle internal (non-API) token actions (POST request)
  def token_ajax(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    redirect = env.params.query["redirect"]?
    redirect ||= "true"
    redirect = redirect == "true"

    if !user
      if redirect
        return env.redirect referer
      else
        return error_json(403, "No such user")
      end
    end

    user = user.as(User)
    sid = sid.as(String)
    token = env.params.body["csrf_token"]?

    begin
      validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue ex
      if redirect
        return error_template(400, ex)
      else
        return error_json(400, ex)
      end
    end

    case action = env.params.query["action"]?
    when "revoke_token"
      session = env.params.query["session"]
      Invidious::Database::SessionIDs.delete(sid: session, email: user.email)
    else
      return error_json(400, "Unsupported action #{action}")
    end

    if redirect
      return env.redirect referer
    else
      env.response.content_type = "application/json"
      return "{}"
    end
  end
end

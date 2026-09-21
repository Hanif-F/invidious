{% skip_file if flag?(:api_only) %}

module Invidious::Routes::Login
  def self.login_page(env)
    render_form(env, false)
  end

  def self.signup_page(env)
    render_form(env, true)
  end

  def self.render_form(env, signup : Bool, error : String? = nil, username = "")
    locale = env.get("preferences").as(Preferences).locale
    referer = get_referer(env, "/feed/subscriptions")
    Authentication.no_store(env)
    return env.redirect referer if env.get?("user")
    return error_template(403, "Login has been disabled by administrator.") unless CONFIG.login_enabled
    return error_template(403, "Registration has been disabled by administrator.") if signup && !CONFIG.registration_enabled
    csrf_token = Authentication.form_token(env, signup ? "signup" : "login")
    captcha = signup && CONFIG.captcha_enabled ? User::Captcha.generate_image(HMAC_KEY) : nil
    templated "user/login"
  end

  def self.login(env)
    submit(env, false)
  end

  def self.signup(env)
    submit(env, true)
  end

  def self.submit(env, signup : Bool)
    locale = env.get("preferences").as(Preferences).locale
    Authentication.no_store(env)
    return error_template(403, "Login has been disabled by administrator.") unless CONFIG.login_enabled
    return error_template(403, "Registration has been disabled by administrator.") if signup && !CONFIG.registration_enabled
    username = env.params.body["username"]? || env.params.body["email"]? || ""
    password = env.params.body["password"]? || ""
    begin
      Authentication.validate_form(env)
    rescue ex : InfoException | JSON::ParseException | KeyError | TypeCastError | ArgumentError
      env.response.status_code = 400
      return render_form(env, signup, "Invalid form. Please try again.", username.byte_slice(0, 254))
    end
    if Authentication.throttle(env, username.byte_slice(0, 254), signup)
      return render_form(env, signup, "Too many attempts. Please try again later.", username.byte_slice(0, 254))
    end
    error = nil
    sid = nil
    if signup
      error = Credentials.username_error(username) || Credentials.password_error(password)
      error ||= "New passwords must match" unless password == env.params.body["password_confirmation"]?
      if !error && CONFIG.captcha_enabled
        begin
          answer = OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, (env.params.body["answer"]? || "").lstrip('0'))
          validate_request(env.params.body["token[0]"]?, answer, env.request, HMAC_KEY, locale)
        rescue
          error = "Erroneous CAPTCHA"
        end
      end
      unless error
        begin
          sid = Database::Accounts.register(username, password, env.get("preferences").as(Preferences))
        rescue ex : PQ::PQError
          raise ex unless ex.field_message(:code) == "23505"
          error = "Username is already taken."
        end
      end
    else
      sid = Database::Accounts.authenticate(username, password) if username.bytesize <= 254 && password.bytesize <= 4096
      error = "Wrong username or password" unless sid
    end
    if sid
      Authentication.set_session(env, sid)
      return env.redirect get_referer(env, "/feed/subscriptions")
    end
    env.response.status_code = signup ? 400 : 401
    render_form(env, signup, error, username.byte_slice(0, 254))
  end

  def self.signout(env)
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

    Invidious::Database::SessionIDs.delete(sid: sid)

    env.request.cookies.each do |cookie|
      cookie.expires = Time.utc(1990, 1, 1)
      env.response.cookies << cookie
    end

    env.redirect referer
  end
end

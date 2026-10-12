{% skip_file if flag?(:api_only) %}

module Invidious::Routes::TvPairing
  extend self

  def show(env, message : String? = nil, finished = false)
    Authentication.no_store(env)
    env.response.headers["Referrer-Policy"] = "no-referrer"
    return error_template(403, "Login has been disabled by administrator.") unless CONFIG.login_enabled
    raw = env.request.method == "POST" ? env.params.body["user_code"]? : env.params.query["user_code"]?
    code = Database::TvPairings.normalize(raw || "")
    user_code = code ? Database::TvPairings.display(code) : ""
    unless env.get?("user")
      destination = code ? "/tv?user_code=#{user_code}" : "/tv"
      return env.redirect "/login?referer=#{URI.encode_www_form(destination)}"
    end
    locale = env.get("preferences").as(Preferences).locale
    user = env.get("user").as(User)
    sid = env.get("sid").as(String)
    csrf_token = generate_response(sid, {"POST:tv"}, HMAC_KEY, 10.minutes)
    templated "user/tv_pairing"
  end

  def submit(env)
    Authentication.no_store(env)
    return error_template(403, "Login has been disabled by administrator.") unless CONFIG.login_enabled
    return show(env) unless env.get?("user")
    user = env.get("user").as(User)
    sid = env.get("sid").as(String)
    ip = Authentication.client_ip(env)
    rules = [{"tv-verify-ip:#{ip}", 5, 60}, {"tv-verify-account:#{user.email}", 5, 60}]
    if API::V1::TvPairing.limited(env, rules, check_only: true)
      return show(env, "Too many attempts. Please try again later.")
    end
    valid = false
    begin
      validate_request(env.params.body["csrf_token"]?, sid, env.request, HMAC_KEY)
      code = Database::TvPairings.normalize(env.params.body["user_code"]? || "")
      decision = env.params.body["decision"]?
      valid = Database::TvPairings.decide(code, user.email, sid, decision == "approve") if code && {"approve", "deny"}.includes?(decision)
    rescue InfoException | JSON::ParseException | KeyError | TypeCastError | ArgumentError | Database::Accounts::SessionError
      valid = false
    end
    unless valid
      if API::V1::TvPairing.limited(env, rules)
        return show(env, "Too many attempts. Please try again later.")
      end
      env.response.status_code = 400
      return show(env, "This code or form is invalid, expired, or already used. Start again on your TV.")
    end
    show(env, env.params.body["decision"] == "approve" ? "TV access approved. Return to your TV to finish signing in." : "TV access denied.", true)
  end
end

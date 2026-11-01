{% skip_file if flag?(:api_only) %}

module Invidious::Routes::DeArrowContributions
  # Read a bounded form directly: do not buffer an unbounded/chunked credential body.
  def self.form(env)
    Authentication.no_store(env)
    user = env.get?("user").try &.as(User)
    sid = env.get?("sid").try &.as(String)
    raise DeArrow::ContributionError.new(403, "Sign in to contribute to DeArrow.") unless user && sid
    raise DeArrow::ContributionError.new(415, "Expected form data") unless env.request.headers["Content-Type"]?.try(&.starts_with?("application/x-www-form-urlencoded"))
    buffer = Bytes.new(8193)
    size = 0
    if body = env.request.body
      while size < buffer.size
        count = body.read(buffer[size..])
        break if count == 0
        size += count
      end
    end
    raw = String.new(buffer[0, size])
    raise DeArrow::ContributionError.new(413, "Request too large") if raw.bytesize > 8192
    params = URI::Params.parse(raw)
    begin
      validate_request(params["csrf_token"]?, sid, env.request, HMAC_KEY)
    rescue
      raise DeArrow::ContributionError.new(403, "Your session expired. Reload the page and try again.")
    end
    if profile = params["browser_profile"]?
      unless profile == Invidious::BrowserProfiles.render_scope(env)
        raise DeArrow::ContributionError.new(409, I18n.translate(env.get("preferences").as(Preferences).locale, "overhaul_channel_profile_changed"))
      end
    end
    DeArrow::AccountContributions.require_storage
    {user, params}
  end

  def self.submit(env, client = DeArrow::CONTRIBUTIONS)
    env.response.content_type = "application/json"
    user, params = form(env)
    DeArrow::AccountContributions.submit(user.email, params["video_id"]? || "", params["action"]? || "",
      params["title"]? || "", params["confirmed"]? == "true", params["uuid"]? || "", params["original"]? == "true", client)
    {ok: true}.to_json
  rescue ex : DeArrow::ContributionError
    env.response.status_code = ex.status
    {error: ex.message}.to_json
  rescue
    env.response.status_code = 502
    {error: "Could not complete the DeArrow action. Refresh before trying again."}.to_json
  end

  IDENTITY_PATH = "/preferences/dearrow/identity"

  private def self.identity_state(env, user : User, sid : String, stored = Database::DeArrowIdentities.snapshot(user.email, HMAC_KEY))
    {ready: DeArrow::IdentityCipher.ready?(CONFIG.dearrow_identity_key), configured: stored[:configured], revision: stored[:revision],
     profile: Invidious::BrowserProfiles.render_scope(env), csrf: generate_response(sid, {"POST:dearrow_identity"}, HMAC_KEY)}
  end

  def self.identity_page(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale
    user = env.get?("user").try(&.as(User))
    sid = env.get?("sid").try(&.as(String))
    unless user && sid
      if env.params.query["format"]? == "json"
        env.response.content_type = "application/json"
        env.response.status_code = 403
        return {error: I18n.translate(locale, "dearrow_login")}.to_json
      end
      return env.redirect "/login?referer=%2Fpreferences%2Fdearrow%2Fidentity"
    end
    identity_state = begin
      identity_state(env, user, sid)
    rescue
      env.response.status_code = 503 if env.response.status_code < 400
      env.set "identity_unavailable", true
      env.set "identity_error", I18n.translate(locale, "overhaul_identity_load") unless env.get?("identity_error")
      {ready: false, configured: false, revision: "", profile: Invidious::BrowserProfiles.render_scope(env), csrf: generate_response(sid, {"POST:dearrow_identity"}, HMAC_KEY)}
    end
    if env.params.query["format"]? == "json"
      env.response.content_type = "application/json"
      return {error: I18n.translate(locale, "overhaul_identity_load")}.to_json if env.get?("identity_unavailable")
      return identity_state.to_json
    end
    templated "user/dearrow_identity"
  end

  private def self.identity_failure(env, code : Int32, message : String, uncertain = false)
    Authentication.no_store(env)
    env.response.status_code = code
    if env.params.query["format"]? == "json"
      env.response.content_type = "application/json"
      return {error: message}.to_json
    end
    return error_template(code, message) unless env.get?("user") && env.get?("sid")
    # Never echo private_id or serialize a credential-bearing failed form.
    env.set "identity_error", message
    env.set "identity_failed", true
    env.set "identity_uncertain", uncertain
    identity_page(env)
  end

  def self.identity(env)
    user, params = form(env)
    locale = env.get("preferences").as(Preferences).locale
    id = params["private_id"]? || ""
    editor = params["identity_editor"]? == "1"
    committed = nil
    if editor && !id.strip.empty?
      stored = Database::DeArrowIdentities.snapshot(user.email, HMAC_KEY)
      if stored[:configured] && params["confirm_replace"]? != "on"
        return identity_failure(env, 400, I18n.translate(locale, "overhaul_identity_confirm"))
      end
      committed = DeArrow::AccountContributions.import_identity(user.email, id, params["revision"]? || "", HMAC_KEY).as(NamedTuple(configured: Bool, revision: String))
    else
      DeArrow::AccountContributions.import_identity(user.email, id)
    end
    if env.params.query["format"]? == "json"
      env.response.content_type = "application/json"
      return {imported: !id.strip.empty?, state: identity_state(env, user, env.get("sid").as(String), committed || Database::DeArrowIdentities.snapshot(user.email, HMAC_KEY))}.to_json
    end
    env.redirect "#{IDENTITY_PATH}?saved=1"
  rescue ex : Database::DeArrowIdentities::StaleIdentity
    identity_failure(env, 409, I18n.translate(env.get("preferences").as(Preferences).locale, "overhaul_identity_changed"))
  rescue ex : DeArrow::ContributionError
    identity_failure(env, ex.status, ex.message || I18n.translate(env.get("preferences").as(Preferences).locale, "dearrow_error"))
  rescue
    identity_failure(env, 503, I18n.translate(env.get("preferences").as(Preferences).locale, "overhaul_identity_uncertain"), uncertain: true)
  end
end

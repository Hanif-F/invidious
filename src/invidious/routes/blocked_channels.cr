{% skip_file if flag?(:api_only) %}

module Invidious::Routes::BlockedChannels
  PATH = "/blocked_channels"

  private def self.json?(env)
    env.params.query["format"]? == "json" || env.params.query["redirect"]? == "false"
  end

  private def self.state(env, user : User, sid : String)
    {channels: Database::BlockedChannels.list(user.email).map { |id, name| {authorId: id, author: name} },
     profile:  Invidious::BrowserProfiles.render_scope(env),
     csrf:     generate_response(sid, {"POST:blocked_channels"}, HMAC_KEY)}.to_json
  end

  private def self.failure(env, code : Int32, message : String, uncertain = false, stale = false)
    env.response.status_code = code
    if json?(env)
      env.response.content_type = "application/json"
      return {error: message}.to_json
    end
    return error_template(code, message) unless env.get?("user") && env.get?("sid")
    env.set "blocked_error", message
    env.set "blocked_uncertain", uncertain
    env.set "blocked_stale", stale
    env.set "blocked_draft", env.params.body.to_s
    index(env)
  end

  def self.index(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale
    user = env.get?("user").try(&.as(User))
    sid = env.get?("sid").try(&.as(String))
    unless user && sid
      return failure(env, 403, I18n.translate(locale, "Sign In")) if json?(env)
      return env.redirect "/login?referer=%2Fblocked_channels"
    end
    channels = [] of Tuple(String, String)
    begin
      if env.params.query["format"]? == "json"
        env.response.content_type = "application/json"
        return state(env, user, sid)
      end
      channels = Database::BlockedChannels.list(user.email)
    rescue
      env.response.status_code = 503 if env.response.status_code < 400
      if env.params.query["format"]? == "json"
        return {error: I18n.translate(locale, "overhaul_blocks_load_error")}.to_json
      end
      env.set "blocked_unavailable", true
      env.set "blocked_error", I18n.translate(locale, "overhaul_blocks_load_error") unless env.get?("blocked_error")
    end
    csrf_token = generate_response(sid, {"POST:blocked_channels"}, HMAC_KEY)
    templated "user/blocked_channels"
  end

  def self.update(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale
    user = env.get?("user").try(&.as(User))
    sid = env.get?("sid").try(&.as(String))
    return failure(env, 403, I18n.translate(locale, "Sign In")) unless user && sid
    if profile = env.params.body["browser_profile"]?
      return failure(env, 409, I18n.translate(locale, "overhaul_channel_profile_changed"), stale: true) unless profile == Invidious::BrowserProfiles.render_scope(env)
    end
    begin
      validate_request(env.params.body["csrf_token"]?, sid, env.request, HMAC_KEY, locale)
    rescue
      # Keep the ordinary contextual endpoint's existing CSRF status/JSON path.
      return failure(env, 400, I18n.translate(locale, "overhaul_channel_session"))
    end
    ucid = env.params.body["ucid"]? || ""
    action = env.params.body["action"]? || ""
    unless ucid.matches?(/\AUC[a-zA-Z0-9_-]{22}\z/) && {"block", "unblock"}.includes?(action)
      return failure(env, 400, I18n.translate(locale, "Invalid request"))
    end
    begin
      if action == "block"
        name = env.params.body["name"]?.try(&.strip) || ""
        Database::BlockedChannels.block(user.email, ucid, name.empty? ? ucid : name[0, 200])
      else
        Database::BlockedChannels.unblock(user.email, ucid)
      end
      if env.params.query["format"]? == "json"
        env.response.content_type = "application/json"
        return state(env, user, sid)
      end
    rescue
      return failure(env, 503, I18n.translate(locale, "overhaul_blocks_unconfirmed"), uncertain: true)
    end
    if env.params.query["redirect"]? == "false"
      env.response.content_type = "application/json"
      return {blocked: action == "block"}.to_json
    end
    env.redirect "#{PATH}?saved=1"
  end

  def self.video_actions(env)
    env.response.content_type = "application/json"
    env.response.headers["Cache-Control"] = "no-store"
    user = env.get?("user").try &.as(User)
    unless user
      env.response.status_code = 403
      return {"error" => "Unauthorized"}.to_json
    end
    playlists = Database::Playlists.select_user_created_playlists(user.email)
    {
      "playlists"       => playlists.map { |id, title| {"id" => id, "title" => title} },
      "defaultPlaylist" => user.preferences.default_playlist,
    }.to_json
  end
end

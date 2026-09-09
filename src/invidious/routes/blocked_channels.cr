{% skip_file if flag?(:api_only) %}

module Invidious::Routes::BlockedChannels
  def self.index(env)
    locale = env.get("preferences").as(Preferences).locale
    user = env.get?("user").try &.as(User)
    return env.redirect "/login?referer=%2Fblocked_channels" unless user
    channels = Database::BlockedChannels.list(user.email)
    templated "user/blocked_channels"
  end

  def self.update(env)
    locale = env.get("preferences").as(Preferences).locale
    env.response.content_type = "application/json" if env.params.query["redirect"]? == "false"
    user = env.get?("user").try &.as(User)
    sid = env.get?("sid").try &.as(String)
    unless user && sid
      env.response.status_code = 403
      return {"error" => I18n.translate(locale, "Sign In")}.to_json
    end
    begin
      validate_request(env.params.body["csrf_token"]?, sid, env.request, HMAC_KEY, locale)
    rescue ex
      env.response.status_code = 400
      return {"error" => ex.message}.to_json
    end
    ucid = env.params.body["ucid"]? || ""
    action = env.params.body["action"]? || ""
    unless ucid.matches?(/^UC[a-zA-Z0-9_-]{22}$/) && {"block", "unblock"}.includes?(action)
      env.response.status_code = 400
      return {"error" => I18n.translate(locale, "Invalid request")}.to_json
    end
    if action == "block"
      name = env.params.body["name"]?.try(&.strip) || ""
      Database::BlockedChannels.block(user.email, ucid, name.empty? ? ucid : name[0, 200])
    else
      Database::BlockedChannels.unblock(user.email, ucid)
    end
    return env.redirect "/blocked_channels" unless env.params.query["redirect"]? == "false"
    {"blocked" => (action == "block")}.to_json
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

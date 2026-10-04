module Invidious::Routes::API::V1::Authenticated
  def self.save_external_playlist(env)
    env.response.content_type = "application/json"
    user = env.get("user").as(User)
    begin
      data = Mobile.read_json(env)
      seed = data["seedVideoId"]?.try &.as_s
    rescue
      return error_json(400, "Invalid playlist subscription JSON.")
    end
    begin
      fields = Invidious::NativePlaylists.resolve(env.params.url["id"], user.email, seed)
    rescue ex : NotFoundException
      return error_json(404, ex)
    rescue ex : InfoException
      return error_json(400, ex)
    rescue ex
      return error_json(502, "Could not load this playlist. Please retry.")
    end
    fields["isSaved"] = JSON::Any.new(true)
    Database::SavedPlaylists.save(user.email, fields)
    fields.to_json
  end

  def self.unsave_external_playlist(env)
    id = env.params.url["id"]
    return error_json(400, "Invalid playlist ID.") unless Invidious::NativePlaylists.valid_id?(id)
    Database::SavedPlaylists.delete(env.get("user").as(User).email, id)
    env.response.status_code = 204
  end

  def self.rss_link(env)
    env.response.content_type = "application/json"
    token = env.get("user").as(User).token
    {feedPath: "/feed/private?#{URI::Params.encode({"token" => token})}"}.to_json
  end

  def self.export_subscriptions(env)
    user = env.get("user").as(User)
    format = env.params.query["format"]? || "rss"
    return error_json(400, "Unsupported OPML format.") unless {"rss", "newpipe"}.includes?(format)
    env.response.content_type = "application/xml"
    env.response.headers["Content-Disposition"] = "attachment; filename=\"subscriptions.opml\""
    Invidious::RSS.subscriptions(user.subscriptions, format)
  end

  def self.playlist_feed(env)
    id = env.params.url["plid"]
    playlist = Database::Playlists.select(id: id)
    user = env.get("user").as(User)
    return error_json(404, "Playlist does not exist.") unless playlist && id.starts_with?("IV") && playlist.author == user.email
    env.response.content_type = "application/atom+xml"
    Invidious::RSS.playlist(playlist)
  end
end

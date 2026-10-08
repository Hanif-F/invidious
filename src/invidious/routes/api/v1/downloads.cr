require "../../../videos/downloads"

module Invidious::Routes::API::V1::Videos
  private def self.download_metadata(env)
    id = env.params.url["id"]
    raise ArgumentError.new("Invalid video ID") unless validate_video_id(id)
    video = get_video(id, region: env.params.query["region"]?)
    JSON.parse(JSON.build { |json| Invidious::JSONify::APIv1.video(video, json, locale: env.get("preferences").as(Preferences).locale, proxy: true) })
  end

  def self.downloads(env)
    env.response.content_type = "application/json"
    metadata = download_metadata(env)
    env.response.headers["Cache-Control"] = "no-store"
    Invidious::Videos::Downloads.catalog(metadata, env.params.url["id"], CONFIG.disabled?("downloads"), CONFIG.dmca_content.includes?(env.params.url["id"]), env.params.query["region"]?)
  rescue ex : ArgumentError
    error_json(400, ex)
  rescue ex : NotFoundException
    error_json(404, ex)
  rescue ex
    error_json(500, ex)
  end

  def self.download_file(env)
    metadata = download_metadata(env)
    reason = Invidious::Videos::Downloads.reason(metadata, CONFIG.disabled?("downloads"), CONFIG.dmca_content.includes?(env.params.url["id"]))
    return error_json(403, reason) unless reason.empty?
    key = env.params.query["key"]?
    entry = Invidious::Videos::Downloads.resolve(metadata, key)
    return error_json(404, "The selected track is no longer available.") unless entry
    title = metadata["title"].as_s.gsub(/[\r\n\/\\]/, "_")
    if entry["kind"].as_s == "caption"
      env.params.query.delete_all("lang")
      env.params.query.delete_all("tlang")
      env.params.query["label"] = entry["label"].as_s
      env.params.query["title"] = "#{title}.vtt"
      return captions(env)
    end
    # Only server-generated local proxy paths are used; callers cannot supply destinations.
    url = Invidious::Videos::Downloads.media_url(entry, HOST_URL, title)
    return error_json(502, "Invalid download destination.") unless url
    env.response.headers["Cache-Control"] = "no-store"
    env.redirect url
  rescue ex : ArgumentError
    error_json(400, ex)
  rescue ex : NotFoundException
    error_json(404, ex)
  rescue ex
    error_json(500, ex)
  end
end

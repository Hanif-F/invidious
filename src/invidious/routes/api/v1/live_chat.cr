module Invidious::Routes::API::V1::LiveChat
  def self.replay(env)
    env.response.content_type = "application/json"
    env.response.headers["Cache-Control"] = "no-store"
    id = env.params.url["id"]
    return error_json(400, InvalidVideoID.new(id)) unless validate_video_id(id)

    offset_raw = env.params.query["offset_ms"]?
    token = env.params.query["continuation"]?
    return error_json(400, "Invalid continuation") if token && (token.empty? || token.bytesize > 4096)

    offset_ms = offset_raw.try(&.to_i64?) || 0_i64
    return error_json(400, "Invalid offset_ms") if offset_raw && (offset_raw.to_i64?.nil? || offset_ms < 0)

    begin
      video = get_video(id)
      return error_json(404, "Chat replay is unavailable") unless video.live_chat_replay? && !video.live_now && !video.upcoming?
      return error_json(400, "offset_ms exceeds video duration") if video.length_seconds > 0 && offset_ms > video.length_seconds.to_i64 * 1000

      if token
        chunk = Invidious::Videos::LiveChat.parse_chunk(YoutubeAPI.live_chat_replay(token, offset_ms))
      else
        next_data = YoutubeAPI.next({"videoId" => id, "params" => ""})
        token = Invidious::Videos::LiveChat.initial_continuation(next_data)
        return error_json(404, "Chat replay is unavailable") unless token
        first = YoutubeAPI.live_chat_replay(token, 0_i64)
        if unfiltered = Invidious::Videos::LiveChat.unfiltered_continuation(first)
          chunk = Invidious::Videos::LiveChat.parse_chunk(YoutubeAPI.live_chat_replay(unfiltered, offset_ms))
        elsif offset_ms > 0
          chunk = Invidious::Videos::LiveChat.parse_chunk(YoutubeAPI.live_chat_replay(token, offset_ms))
        else
          chunk = Invidious::Videos::LiveChat.parse_chunk(first)
        end
        chunk[:messages].reject! { |message| message["offsetMs"].as_i64 < offset_ms - 15_000 } if offset_ms > 0
      end
      return {
        messages:     chunk[:messages],
        removedIds:   chunk[:removed_ids],
        continuation: chunk[:continuation],
      }.to_json
    rescue ex : NotFoundException
      return error_json(404, ex)
    rescue ex
      LOGGER.error("live chat replay: #{id}: #{ex.message}")
      return error_json(503, "Chat replay could not be loaded")
    end
  end
end

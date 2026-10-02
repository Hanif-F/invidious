require "./clips/validation"

struct InvidiousClip
  include DB::Serializable

  property id : String
  property owner : String
  property video_id : String
  property ucid : String
  property title : String
  property start_ms : Int64
  property end_ms : Int64
  property created_at : Time
  property video_title : String
  property channel_name : String
  property video_duration : Int32
  property creator : String

  def start_time : Float64
    start_ms / 1000.0
  end

  def end_time : Float64
    end_ms / 1000.0
  end

  def permalink : String
    "/clip/#{id}"
  end

  # Public serialization deliberately excludes the internal owner identifier.
  def to_json(json : JSON::Builder)
    json.object do
      json.field "type", "invidiousClip"
      json.field "clipId", id
      json.field "clipTitle", title
      json.field "startTime", start_time
      json.field "endTime", end_time
      json.field "creator", creator
      json.field "createdAt", created_at.to_unix
      json.field "url", "#{HOST_URL}#{permalink}"
      json.field "video" do
        json.object do
          json.field "videoId", video_id
          json.field "title", video_title
          json.field "author", channel_name
          json.field "authorId", ucid
          json.field "lengthSeconds", video_duration
          json.field "thumbnail", "#{HOST_URL}/vi/#{video_id}/mqdefault.jpg"
        end
      end
    end
  end
end

module Invidious::Clips
  extend self
  PAGE_SIZE = 30

  def source_error(video : Video) : String?
    status = video.info.dig?("playabilityStatus", "status").try(&.as_s?)
    return "Clips require a playable video or completed livestream archive." if video.live_now || video.upcoming? || video.length_seconds < 5 || video.reason || video.members_only || video.premiere_timestamp.try(&.> Time.utc) || (status && status != "OK")
    return "Invalid source channel." unless video.ucid.matches?(/\AUC[a-zA-Z0-9_-]{22}\z/)
    nil
  end

  def create(user : User, video_id : String, title : String, start_time : String, end_time : String) : InvidiousClip
    raise ArgumentError.new("Invalid video ID.") unless validate_video_id(video_id)
    title = Validation.title(title)
    start_ms = Validation.milliseconds(start_time)
    end_ms = Validation.milliseconds(end_time)
    video = get_video(video_id)
    raise ArgumentError.new("Invalid source video.") unless video.id == video_id
    if error = source_error(video)
      raise ArgumentError.new(error)
    end
    Validation.range(start_ms, end_ms, video.length_seconds)
    clip = InvidiousClip.new({
      id: "IVCL#{Random::Secure.urlsafe_base64(24)}", owner: user.email,
      video_id: video.id, ucid: video.ucid, title: title, start_ms: start_ms, end_ms: end_ms,
      created_at: Time.utc, video_title: video.title, channel_name: video.author,
      video_duration: video.length_seconds, creator: user.username,
    })
    Database::Clips.insert(clip)
    clip
  end

  def page(value : String?) : Int32
    (value.try(&.to_i?) || 1).clamp(1, Int32::MAX)
  end
end

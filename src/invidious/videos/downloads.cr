require "json"
require "digest/sha256"
require "uri"

# Stable selectors deliberately exclude expiring URLs. Audio variants may share an itag.
module Invidious::Videos::Downloads
  def self.key(kind : String, format : JSON::Any) : String
    audio = format["audioTrack"]?.try &.as_h?
    identity = {kind, format["itag"]?.try(&.to_s) || "", audio.try(&.["id"]?).try(&.as_s?) || "",
                format["isDrc"]?.try(&.as_bool?) == true, format["bitrate"]?.try(&.to_s) || "",
                format["label"]?.try(&.as_s?) || "", format["language_code"]?.try(&.as_s?) || "",
                format["type"]?.try(&.as_s?) || "", format["size"]?.try(&.as_s?) || "", format["fps"]?.try(&.to_s) || ""}.to_json
    Digest::SHA256.hexdigest(identity)
  end

  def self.choices(video : JSON::Any) : Array(JSON::Any)
    result = [] of JSON::Any
    video["adaptiveFormats"]?.try(&.as_a?).try &.each do |format|
      type = format["type"]?.try(&.as_s?) || ""
      kind = type.starts_with?("video/") ? "video" : type.starts_with?("audio/") ? "audio" : nil
      next unless kind && format["url"]?.try(&.as_s?).try { |url| !url.empty? }
      next if format["targetDurationSec"]? || format["maxDvrDurationSec"]?
      entry = format.as_h.dup
      entry["key"] = JSON::Any.new(key(kind, format))
      entry["kind"] = JSON::Any.new(kind)
      result << JSON::Any.new(entry)
    end
    video["captions"]?.try(&.as_a?).try &.each do |caption|
      entry = caption.as_h.dup
      entry["key"] = JSON::Any.new(key("caption", caption))
      entry["kind"] = JSON::Any.new("caption")
      result << JSON::Any.new(entry)
    end
    result.uniq { |entry| entry["key"].as_s }
  end

  def self.reason(video : JSON::Any, disabled : Bool, blocked : Bool) : String
    return "Downloads are disabled by this instance." if disabled
    return "Downloads are unavailable for this video." if blocked
    return "Live and upcoming videos cannot be downloaded." if video["liveNow"]?.try(&.as_bool?) == true || video["isUpcoming"]?.try(&.as_bool?) == true
    return "No separate downloadable media tracks are available." unless choices(video).any? { |entry| entry["kind"].as_s != "caption" }
    ""
  end

  def self.catalog(video : JSON::Any, id : String, disabled : Bool, blocked : Bool, region : String? = nil) : String
    why = reason(video, disabled, blocked)
    entries = why.empty? ? choices(video) : [] of JSON::Any
    entries.each do |entry|
      params = URI::Params.new
      params["key"] = entry["key"].as_s
      params["region"] = region if region
      entry.as_h["url"] = JSON::Any.new("/api/v1/videos/#{id}/download?#{params}")
    end
    {"video" => video, "allowed" => why.empty?, "reason" => why, "choices" => entries}.to_json
  end

  def self.resolve(video : JSON::Any, selector : String?) : JSON::Any?
    choices(video).find { |entry| entry["key"].as_s == selector }
  end

  def self.media_url(entry : JSON::Any, origin : String, title : String) : String?
    url = URI.parse(entry["url"].as_s)
    base = URI.parse(origin)
    return nil unless url.host == base.host && url.scheme == base.scheme && url.port == base.port && url.user.nil? && url.password.nil? &&
                      (url.path == "/videoplayback" || url.path.starts_with?("/companion/"))
    params = url.query_params
    params["title"] = title.gsub(/[\r\n\/\\]/, "_")
    url.query_params = params
    url.to_s
  end
end

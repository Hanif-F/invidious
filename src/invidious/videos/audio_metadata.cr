require "json"
require "uri"

module Invidious::Videos::AudioMetadata
  def self.stable_volume?(fmt : Hash(String, JSON::Any)) : Bool
    name = fmt["audioTrack"]?.try &.as_h?.try &.["displayName"]?.try &.as_s? || ""
    url = fmt["url"]?.try &.as_s? || ""
    drc_url = begin
      URI.decode_www_form(url).includes?("acont=drc")
    rescue
      false
    end
    fmt["isDrc"]?.try(&.as_bool?) == true || name.downcase.includes?("stable volume") || drc_url
  end

  # Additive public metadata only; stream URLs and account state are excluded.
  def self.write(json : JSON::Builder, fmt : Hash(String, JSON::Any))
    if track = fmt["audioTrack"]?.try &.as_h?
      json.field "audioTrack" do
        json.object do
          {"id", "displayName"}.each do |key|
            if value = track[key]?.try &.as_s?
              json.field key, value
            end
          end
          value = track["audioIsDefault"]?.try &.as_bool?
          unless value.nil?
            json.field "audioIsDefault", value
          end
        end
      end
    end
    json.field "isDrc", stable_volume?(fmt)
  end
end

require "./channel_avatars"
require "../../videos/view_counts"

module Invidious::JSONify::APIv1::VideoMetadata
  extend self
  alias Counts = Invidious::Videos::ViewCounts
  private COLLECTIONS = %w(videos notifications entries playlists latestVideos recommendedVideos video clips)

  def build(locale : String? = nil, &) : String
    enrich_json(JSON.build { |json| yield json }, locale)
  end

  def enrich_json(body : String, locale : String? = nil) : String
    value = JSON.parse(ChannelAvatars.enrich_json(body))
    enrich(value, locale) { |ids| Invidious::Database::Videos.select_view_counts(ids) }.to_json
  end

  def enrich(value : JSON::Any, locale : String? = nil, &lookup : Array(String) -> Hash(String, Counts::Count)) : JSON::Any
    records = [] of Hash(String, JSON::Any)
    collect(value, records)
    supplied = {} of String => Counts::Count?
    records.each { |record| supplied[identity(record)] ||= Counts.from_api(record) }
    available = Counts.resolve(supplied) { |ids| yield ids }
    records.each do |record|
      if count = Counts.from_api(record) || available[identity(record)]?
        count.fields(record, locale)
      end
    end
    value
  end

  private def identity(record) : String
    record["videoId"]?.try(&.as_s?) || record["video_id"]?.try(&.as_s?) || ""
  end

  private def collect(value, records)
    if array = value.as_a?
      array.each { |item| collect(item, records) }
    elsif record = value.as_h?
      # A clip's videoId identifies its source, not the clip's own statistics.
      records << record unless identity(record).empty? || record.has_key?("clipId")
      COLLECTIONS.each do |key|
        if child = record[key]?
          collect(child, records)
        end
      end
    end
  end
end

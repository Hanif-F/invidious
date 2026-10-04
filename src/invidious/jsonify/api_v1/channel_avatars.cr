require "json"
require "../../helpers/channel_avatars"

module Invidious::JSONify::APIv1::ChannelAvatars
  extend self

  # Visit identity-bearing records only, not stream formats or arbitrary JSON.
  private COLLECTIONS = %w(videos notifications entries playlists latestVideos recommendedVideos relatedChannels)

  def build(&) : String
    body = JSON.build { |json| yield json }
    enrich_json(body)
  end

  def enrich_json(body : String) : String
    enrich(JSON.parse(body),
      ->(ids : Array(String)) { Invidious::Database::ChannelAvatars.select(ids) },
      ->(urls : Hash(String, String)) { Invidious::Database::ChannelAvatars.observe(urls) }).to_json
  end

  # The injected boundaries also let tests prove one batch read and zero upstream calls.
  def enrich(value : JSON::Any, lookup : Proc(Array(String), Hash(String, String)), learn : Proc(Hash(String, String), Bool)) : JSON::Any
    records = [] of Hash(String, JSON::Any)
    collect(value, records)
    supplied = {} of String => String
    ids = [] of String
    records.each do |record|
      id = identity(record)
      next if id.empty?
      ids << id
      if url = supplied_url(record)
        supplied[id] = url
      end
    end
    begin
      learn.call(supplied) unless supplied.empty?
    rescue
      # Optional cache errors must not escape into a metadata refetch/retry path.
    end
    missing = ids.uniq.reject { |id| supplied.has_key?(id) }
    cached = {} of String => String
    begin
      cached = lookup.call(missing) unless missing.empty?
    rescue
    end
    available = cached.merge(supplied)
    records.each do |record|
      next if supplied_url(record)
      if url = Invidious::ChannelAvatars.proxy_url(available[identity(record)]?)
        record["authorThumbnails"] = JSON.parse([{url: url, width: 88, height: 88}].to_json)
      end
    end
    value
  end

  private def identity(record)
    record["authorId"]?.try(&.as_s?) || record["channel_id"]?.try(&.as_s?) || ""
  end

  private def supplied_url(record) : String?
    if url = Invidious::ChannelAvatars.proxy_url(record["authorThumbnail"]?.try(&.as_s?))
      return url
    end
    record["authorThumbnails"]?.try(&.as_a?).try do |images|
      images.reverse_each do |image|
        if url = Invidious::ChannelAvatars.proxy_url(image.as_h?.try(&.["url"]?).try(&.as_s?))
          return url
        end
      end
    end
    nil
  end

  private def collect(value, records)
    if array = value.as_a?
      array.each { |item| collect(item, records) }
    elsif record = value.as_h?
      records << record unless identity(record).empty?
      COLLECTIONS.each do |key|
        if child = record[key]?
          collect(child, records)
        end
      end
    end
  end
end

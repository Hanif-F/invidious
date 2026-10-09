require "json"
require "big"

# Source provenance belongs alongside the cached values, before display rounding.
module Invidious::Videos::Metadata
  extend self

  def count(text : String?) : {Int64?, String}
    return {nil, "unknown"} if text.nil? || text.blank?
    return {0_i64, "exact"} if text.matches?(/\A\s*no (views|likes)\s*\z/i)
    matches = text.scan(/(?<![\d.,+-])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([KMBT])?(?=\s|$)/i)
    return {nil, "unknown"} unless matches.size == 1
    number = matches.first[1].delete(',')
    suffix = matches.first[2]?.try(&.upcase) || ""
    if suffix.empty?
      return {number.to_i64?, number.to_i64? ? "exact" : "unknown"}
    end
    scale = {"K" => 1_000_i64, "M" => 1_000_000_i64, "B" => 1_000_000_000_i64, "T" => 1_000_000_000_000_i64}[suffix]
    value = (BigDecimal.new(number) * scale).to_big_i
    return {nil, "unknown"} if value > Int64::MAX
    {value.to_i64, "approximate"}
  rescue
    {nil, "unknown"}
  end

  def publication(value : String?) : Time?
    return nil if value.nil? || value.blank?
    date = value.includes?('T') ? Time.parse_rfc3339(value) : Time.parse(value, "%Y-%m-%d", Time::Location::UTC)
    valid_publication?(date) ? date.to_utc.at_beginning_of_day : nil
  rescue
    nil
  end

  def valid_publication?(date : Time) : Bool
    date >= Time.utc(2005, 1, 1) && date <= Time.utc + 5.minutes
  end

  def publication_text(value : String?) : Time?
    return nil if value.nil? || value.blank?
    return publication(value) if value.matches?(/\A\d{4}-\d{2}-\d{2}/)
    date = if value.matches?(/\A[a-z]{3} \d{1,2}, \d{4}\z/i)
             Time.parse(value, "%b %-d, %Y", Time::Location::UTC)
           else
             decode_date(value)
           end
    valid_publication?(date) ? date : nil
  rescue
    nil
  end

  # One optional cache read for the whole page; this path never refreshes metadata.
  def enrich_shorts(items, &lookup : Array(String) -> Hash(String, JSON::Any))
    ids = items.compact_map do |item|
      item.id if item.is_a?(SearchVideo) && (!valid_publication?(item.published) || item.length_seconds <= 0)
    end.uniq
    return items if ids.empty?
    begin
      cached = yield ids
    rescue
      return items
    end
    items.map do |item|
      if item.is_a?(SearchVideo) && (info = cached[item.id]?.try(&.as_h?))
        if !valid_publication?(item.published) && info["publishedIsKnown"]?.try(&.as_bool?) == true
          if date = publication((info["sourcePublished"]? || info["published"]?).try(&.as_s?))
            item.published = date
          end
        end
        if item.length_seconds <= 0
          if duration = info["lengthSeconds"]?.try(&.as_i64?)
            item.length_seconds = duration.to_i32 if 0 < duration <= Int32::MAX
          end
        end
      end
      item
    end
  end
end

require "./metadata"

# Presentation metadata only. Resolving a count never fetches or saves a video.
module Invidious::Videos::ViewCounts
  extend self

  record Count, value : Int64, precision : String, kind : String = "views" do
    def text(locale : String?) : String
      key = kind == "watching" ? "generic_watching_count" : "generic_views_count"
      I18n.translate_count(locale || "en-US", key, value, I18n::NumberFormatting::Short)
    end

    def fields(record : Hash(String, JSON::Any), locale : String?)
      record["viewCount"] = JSON::Any.new(value)
      record["viewCountPrecision"] = JSON::Any.new(precision)
      record["viewCountType"] = JSON::Any.new(kind)
      record["viewCountText"] = JSON::Any.new(text(locale))
    end

    def to_json_fields(json : JSON::Builder, locale : String?)
      json.field "viewCount", value
      json.field "viewCountPrecision", precision
      json.field "viewCountType", kind
      json.field "viewCountText", text(locale)
    end
  end

  def numeric(value : Int64?, precision : String? = nil, kind : String? = nil) : Count?
    return nil unless value && value >= 0
    return nil if precision && !{"exact", "approximate", "unknown"}.includes?(precision)
    return nil if precision == "unknown" && kind.nil?
    return nil if kind && !{"views", "watching"}.includes?(kind)
    Count.new(value, precision || "unknown", kind || "views")
  end

  def from_text(text : String?, kind : String = "views") : Count?
    value, precision = Metadata.count(text)
    return nil unless value
    kind = "watching" if text.try(&.downcase.includes?("watching"))
    Count.new(value, precision, kind)
  end

  # Accessibility labels often also include titles, durations and upload ages.
  # Only count-labelled segments are eligible, never arbitrary numbers in a label.
  def labelled(text : String?) : Array(Count)
    result = [] of Count
    text.try &.scan(/(?<![\w.,+\-])(?:no|\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*[KMBT]?\s+(?:views?|watching)\b/i) do |match|
      if count = from_text(match[0])
        result << count
      end
    end
    # A full card label can contain a title such as "My first 100 views".
    # Ambiguous labels must not override the renderer's dedicated count text.
    result.size <= 1 ? result : [] of Count
  end

  def text(box : JSON::Any?) : String?
    return nil unless box
    return box.as_s? if box.as_s?
    return nil unless hash = box.as_h?
    hash["simpleText"]?.try(&.as_s?) || hash["content"]?.try(&.as_s?) ||
      hash["runs"]?.try(&.as_a?).try(&.compact_map { |run| run.as_h?.try(&.["text"]?).try(&.as_s?) }.join)
  end

  def best(counts : Array(Count)) : Count?
    counts.min_by? { |count| {count.kind == "views" ? 0 : 1, count.precision == "exact" ? 0 : (count.precision == "approximate" ? 1 : 2)} }
  end

  def from_renderer(renderer : JSON::Any) : Count?
    counts = [] of Count
    hash = renderer.as_h?
    return nil unless hash
    {"viewCountText", "shortViewCountText", "viewCount", "videoInfo"}.each do |key|
      if box = hash[key]?
        if key == "viewCount" && (value = box.as_i64?) && value >= 0
          counts << Count.new(value, "exact", hash["isLive"]?.try(&.as_bool?) == true ? "watching" : "views")
        end
        label = text(box)
        counts.concat(labelled(label))
        if count = from_text(label, hash["isLive"]?.try(&.as_bool?) == true ? "watching" : "views")
          counts << count
        end
        counts.concat(labelled(box.dig?("accessibility", "accessibilityData", "label").try(&.as_s?))) if box.as_h?
      end
    end
    counts.concat(labelled(renderer.dig?("accessibility", "accessibilityData", "label").try(&.as_s?)))
    counts.concat(labelled(hash["accessibilityLabel"]?.try(&.as_s?)))
    counts.concat(labelled(text(renderer.dig?("overlayMetadata", "secondaryText"))))

    metadata = renderer.dig?("metadata", "lockupMetadataViewModel") || renderer
    rows = metadata.dig?("metadata", "contentMetadataViewModel", "metadataRows").try(&.as_a?)
    rows.try &.each do |row|
      row.as_h?.try(&.["metadataParts"]?).try(&.as_a?).try &.each do |part|
        next unless part.as_h?
        next if part.dig?("text", "commandRuns")
        content = text(part["text"]?)
        counts.concat(labelled(content))
        counts.concat(labelled(part["accessibilityLabel"]?.try(&.as_s?)))
        counts.concat(labelled(part.dig?("text", "accessibility", "accessibilityData", "label").try(&.as_s?)))
        if part.dig?("leadingIcon", "name").try(&.as_s?) == "PLAY_ARROW_OUTLINED"
          if count = from_text(content)
            counts << count
          end
        end
      end
    end
    best(counts)
  rescue
    # Malformed optional metadata must not discard the video.
    best(counts || [] of Count)
  end

  def from_info(info : Hash(String, JSON::Any)) : Count?
    value = info["views"]?.try(&.as_i64?)
    precision = info["viewCountPrecision"]?.try(&.as_s?)
    kind = info["viewCountType"]?.try(&.as_s?)
    # Old live caches did not distinguish concurrent viewers from total views.
    return nil if kind.nil? && info["videoType"]?.try(&.as_s?) == "Livestream"
    return nil if precision.nil? && value == 0
    numeric(value, precision, kind)
  end

  def from_item(item) : Count?
    if item.is_a?(Video)
      from_info(item.info)
    elsif item.responds_to?(:views)
      precision = item.responds_to?(:view_count_precision) ? item.view_count_precision : nil
      kind = item.responds_to?(:view_count_type) ? item.view_count_type : nil
      if kind.nil? && item.responds_to?(:updated) && item.responds_to?(:live_now) && item.live_now
        return nil
      end
      numeric(item.views, precision, kind)
    end
  end

  def from_related(item : Hash(String, String)) : Count?
    if item.has_key?("view_count_precision")
      numeric(item["view_count"]?.try(&.to_i64?), item["view_count_precision"]?, item["view_count_type"]?.presence)
    elsif (value = item["short_view_count"]?.presence) && value != "0"
      from_text(value)
    end
  end

  def from_api(record : Hash(String, JSON::Any)) : Count?
    return nil if record["viewCountType"]?.try(&.as_s?).nil? && record["liveNow"]?.try(&.as_bool?) == true
    numeric(record["viewCount"]?.try(&.as_i64?), record["viewCountPrecision"]?.try(&.as_s?), record["viewCountType"]?.try(&.as_s?))
  end

  # Supplied counts win. Missing IDs, including repeated playlist occurrences,
  # are resolved in one local batch; failures never fall through to the network.
  def resolve(supplied : Hash(String, Count?), &lookup : Array(String) -> Hash(String, Count)) : Hash(String, Count?)
    missing = supplied.select { |_, count| count.nil? }.keys
    return supplied if missing.empty?
    begin
      cached = yield missing
      supplied.to_h { |id, count| {id, count || cached[id]?} }
    rescue
      supplied
    end
  end
end

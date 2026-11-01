require "./channel_spoilers"

module Invidious::ChannelSpoilers
  # Web editing owns one rule. Keep the raw surrounding document and future
  # properties instead of serializing every rule through the current model.
  def self.merge_web_rule(stored : Hash(String, JSON::Any), id : String, entry : Rule?) : Hash(String, JSON::Any)
    raise ArgumentError.new("Invalid channel") unless id.matches?(/\AUC[A-Za-z0-9_-]{22}\z/)
    field = "channel_spoiler_settings"
    if value = stored[field]?
      raise ArgumentError.new("Invalid stored channel rules") unless value.raw.nil? || value.as_h?
    end
    rules = stored[field]?.try(&.as_h?).try(&.dup) || {} of String => JSON::Any
    if entry
      if previous = rules[id]?
        raise ArgumentError.new("Invalid stored channel rule") unless previous.raw.nil? || previous.as_h?
      end
      raise ArgumentError.new("Invalid reveal delay") if entry.reveal_after_days.try { |days| days < 1 }
      raise ArgumentError.new("Too many channel rules") if rules.size >= 1000 && !rules.has_key?(id) && (entry.hide_title || entry.hide_thumbnail)
      record = rules[id]?.try(&.as_h?).try(&.dup) || {} of String => JSON::Any
      record["name"] = JSON::Any.new(entry.name[0, 200]) if record["name"]?.try(&.as_s?).try(&.empty?) != false
      record["hide_title"] = JSON::Any.new(entry.hide_title)
      record["hide_thumbnail"] = JSON::Any.new(entry.hide_thumbnail)
      record["reveal_after_days"] = entry.reveal_after_days ? JSON::Any.new(entry.reveal_after_days.not_nil!.to_i64) : JSON::Any.new(nil)
      if !entry.hide_title && !entry.hide_thumbnail && (record.keys - %w(name hide_title hide_thumbnail reveal_after_days)).empty?
        rules.delete(id)
      else
        rules[id] = JSON::Any.new(record)
      end
    else
      rules.delete(id)
    end
    merged = stored.dup
    merged[field] = JSON::Any.new(rules)
    merged
  end
end

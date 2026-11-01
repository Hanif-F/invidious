require "./sponsorblock"

module Invidious::SponsorBlock
  # Patch one web-owned channel against the latest raw document. Other channels,
  # unrelated preferences and future native fields remain unchanged.
  def self.merge_channel_override(stored : Hash(String, JSON::Any), id : String, entry : ChannelOverride?) : Hash(String, JSON::Any)
    raise ArgumentError.new("Invalid channel ID") unless id.matches?(/\AUC[a-zA-Z0-9_-]{22}\z/)
    field = "sponsorblock_channel_overrides"
    if value = stored[field]?
      raise ArgumentError.new("Invalid stored SponsorBlock overrides") unless value.raw.nil? || value.as_h?
    end
    overrides = stored[field]?.try(&.as_h?).try(&.dup) || {} of String => JSON::Any
    if entry
      if previous = overrides[id]?
        raise ArgumentError.new("Invalid stored channel override") unless previous.raw.nil? || previous.as_h?
      end
      raise ArgumentError.new("Too many channel overrides") if overrides.size >= 1000 && !overrides.has_key?(id) && (!entry.enabled.nil? || !entry.modes.empty?)
      entry.modes.each do |category, mode|
        raise ArgumentError.new("Invalid SponsorBlock mode") unless CATEGORIES.has_key?(category) && {"auto", "manual", "marker", "disabled"}.includes?(mode)
      end
      record = overrides[id]?.try(&.as_h?).try(&.dup) || {} of String => JSON::Any
      if previous_modes = record["modes"]?
        raise ArgumentError.new("Invalid stored channel modes") unless previous_modes.raw.nil? || previous_modes.as_h?
      end
      modes = record["modes"]?.try(&.as_h?).try(&.dup) || {} of String => JSON::Any
      CATEGORIES.each_key { |category| modes.delete(category) }
      entry.modes.each { |category, mode| modes[category] = JSON::Any.new(mode) }
      record["enabled"] = JSON::Any.new(entry.enabled)
      record["modes"] = JSON::Any.new(modes)
      record["name"] = JSON::Any.new(entry.name) if record["name"]?.try(&.as_s?).try(&.empty?) != false
      if entry.enabled.nil? && modes.empty? && record.keys.all? { |key| {"name", "enabled", "modes"}.includes?(key) }
        overrides.delete(id)
      else
        overrides[id] = JSON::Any.new(record)
      end
    else
      overrides.delete(id)
    end
    merged = stored.dup
    merged[field] = JSON::Any.new(overrides)
    merged
  end
end

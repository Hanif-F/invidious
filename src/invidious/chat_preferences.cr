require "json"

# Native chat PATCH and the dedicated browser editor share the native field
# limits. Applying a patch retains the latest raw document, including fields
# that this application version does not interpret.
module Invidious::ChatPreferences
  extend self

  BOOLEANS = %w(chat_show_timestamps chat_overlay_mode)
  STRINGS  = %w(chat_user_blacklist chat_word_blacklist)
  RANGES   = {
    "chat_font_scale"      => 75..150,
    "chat_width_px"        => 280..640,
    "chat_overlay_opacity" => 0..100,
    "chat_overlay_x"       => 0..1000,
    "chat_overlay_y"       => 0..1000,
    "chat_overlay_width"   => 1..1000,
    "chat_overlay_height"  => 1..1000,
  }
  GEOMETRY = %w(chat_overlay_x chat_overlay_y chat_overlay_width chat_overlay_height)

  def validate_patch(data : Hash(String, JSON::Any))
    raise ArgumentError.new("Invalid chat settings") if data.empty?
    data.each do |key, value|
      valid = if BOOLEANS.includes?(key)
                !value.as_bool?.nil?
              elsif STRINGS.includes?(key)
                value.as_s?.try { |text| text.bytesize <= 1024 } || false
              elsif range = RANGES[key]?
                value.as_i?.try { |number| range.includes?(number) } || false
              else
                false
              end
      raise ArgumentError.new("Invalid chat settings") unless valid
    end
  end

  def merge_patch(stored : Hash(String, JSON::Any), data : Hash(String, JSON::Any))
    validate_patch(data)
    stored.merge(data)
  end

  def validate_geometry(data, x, y, width, height)
    return unless data.keys.any? { |key| GEOMETRY.includes?(key) }
    if x.to_i64 + width > 1000 || y.to_i64 + height > 1000
      raise ArgumentError.new("Invalid chat settings")
    end
  end
end

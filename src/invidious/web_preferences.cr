require "json"
require "uri"
require "./native_preferences"
require "./history"

# Ownership and validation for category-scoped browser saves. Persistence belongs
# to the route transaction: never serialize a whole Preferences object over the
# latest stored JSON when only one category was submitted.
module Invidious::WebPreferences
  SECTIONS = {
    "appearance"        => %w(dark_mode show_nick),
    "language"          => %w(locale region timezone),
    "browsing"          => %w(default_home feed_menu show_member_videos show_original_title search_privacy automatic_instance_redirect),
    "playback"          => %w(preload autoplay continue continue_autoplay video_loop listen local quality quality_dash video_codec preferred_audio speed seek_seconds vr_mode annotations annotations_subscribed),
    "captions-comments" => %w(captions comments related_videos extend_desc),
    "library"           => %w(watch_history save_player_pos max_results sort latest_only unseen_only notifications_only default_playlist),
    "sponsorblock"      => %w(sponsorblock_enabled sponsorblock_modes sponsorblock_colors),
    "dearrow"           => %w(dearrow_enabled dearrow_show_original),
    "ai-filter"         => %w(ai_filter_enabled ai_blocklist_feeds_action ai_blocklist_search_action ai_blocklist_recommendations_action ai_blocklist_other_pages_action ai_warnlist_feeds_action ai_warnlist_search_action ai_warnlist_recommendations_action ai_warnlist_other_pages_action),
  }
  DEDICATED = {
    "chat"                 => %w(chat_show_timestamps chat_font_scale chat_width_px chat_overlay_mode chat_overlay_opacity chat_overlay_x chat_overlay_y chat_overlay_width chat_overlay_height chat_user_blacklist chat_word_blacklist),
    "channel-visibility"   => %w(channel_spoiler_settings),
    "sponsorblock-channel" => %w(sponsorblock_channel_overrides),
  }
  # Retire only browser rendering, never native/legacy persistence contracts.
  PRESERVED_ONLY     = %w(ui_density thin_mode player_style ai_blocklist_action ai_warnlist_action ai_blocklist_feeds ai_blocklist_search ai_blocklist_recommendations ai_blocklist_other_pages ai_warnlist_feeds ai_warnlist_search ai_warnlist_recommendations ai_warnlist_other_pages)
  LEGACY_AI_SWITCHES = PRESERVED_ONLY.select { |field| field.starts_with?("ai_") && !field.ends_with?("_action") }
  BOOLEANS           = %w(show_nick show_member_videos show_original_title search_privacy automatic_instance_redirect preload autoplay continue continue_autoplay video_loop listen local vr_mode annotations annotations_subscribed related_videos extend_desc watch_history save_player_pos latest_only unseen_only notifications_only sponsorblock_enabled dearrow_enabled dearrow_show_original ai_filter_enabled)
  ARRAYS             = {"captions" => 3, "comments" => 2, "feed_menu" => 4}
  MERGED_MAPS        = %w(sponsorblock_modes sponsorblock_colors)
  NULLABLE           = %w(timezone region default_playlist default_home)

  class InvalidField < ArgumentError
    getter field : String

    def initialize(@field : String)
      super("Invalid setting: #{@field}")
    end
  end

  def self.fields(section : String) : Array(String)
    SECTIONS[section]? || raise InvalidField.new("section")
  end

  # An omitted checkbox means false only inside its owning category. Omitted
  # scalar/array controls are sparse edits and preserve their latest value.
  def self.parse(section : String, form : URI::Params, previous : Hash(String, JSON::Any), locales : Array(String)) : Hash(String, JSON::Any)
    owned = fields(section)
    patch = {} of String => JSON::Any
    owned.each do |field|
      if BOOLEANS.includes?(field)
        patch[field] = JSON::Any.new(boolean(form[field]?, field))
      elsif size = ARRAYS[field]?
        next unless (0...size).any? { |index| form.has_key?("#{field}[#{index}]") }
        old = previous[field]?.try(&.as_a?) || [] of JSON::Any
        values = (0...size).map do |index|
          supplied = form["#{field}[#{index}]"]?
          value = supplied || old[index]?.try(&.as_s?) || ""
          value = "youtube" if supplied.nil? && field == "comments" && value == "reddit"
          JSON::Any.new(value)
        end
        values.reject! { |value| value.as_s.empty? } if field == "feed_menu"
        value = JSON::Any.new(values)
        validate(field, value, locales)
        patch[field] = value
      elsif MERGED_MAPS.includes?(field)
        prefix = field == "sponsorblock_modes" ? "sponsorblock_mode_" : "sponsorblock_color_"
        changed = {} of String => JSON::Any
        Invidious::SponsorBlock::CATEGORIES.each_key do |category|
          if value = form[prefix + category]?
            changed[category] = JSON::Any.new(value)
          end
        end
        next if changed.empty?
        validate(field, JSON::Any.new(changed), locales)
        existing = previous[field]?.try(&.as_h?) || {} of String => JSON::Any
        patch[field] = JSON::Any.new(existing.merge(changed))
      elsif value = form[field]?
        parsed = case field
                 when "max_results", "seek_seconds"
                   JSON::Any.new(value.to_i64? || raise InvalidField.new(field))
                 when "speed"
                   JSON::Any.new(value.to_f64? || raise InvalidField.new(field))
                 when "region", "timezone", "default_playlist"
                   value.empty? ? JSON::Any.new(nil) : JSON::Any.new(value)
                 else
                   JSON::Any.new(value)
                 end
        validate(field, parsed, locales)
        patch[field] = parsed
      end
    end
    patch
  end

  private def self.boolean(value : String?, field : String) : Bool
    case value
    when nil, "off", "false", "0" then false
    when "on", "true", "1"        then true
    else                               raise InvalidField.new(field)
    end
  end

  private def self.validate(field : String, value : JSON::Any, locales : Array(String))
    case field
    when "locale"
      raise InvalidField.new(field) unless locales.includes?(value.as_s)
    when "timezone"
      raise InvalidField.new(field) unless value.raw.nil? || Invidious::History.timezone(value.as_s)
    when "region"
      raise InvalidField.new(field) unless value.raw.nil? || value.as_s.matches?(/\A[A-Z]{2}\z/)
    when "quality"
      raise InvalidField.new(field) unless %w(dash medium small).includes?(value.as_s)
    else
      Invidious::NativePreferences.validate_patch({field => value})
    end
  rescue ex : InvalidField
    raise ex
  rescue
    raise InvalidField.new(field)
  end

  def self.apply(section : String, form : URI::Params, stored : Hash(String, JSON::Any), locales : Array(String)) : Hash(String, JSON::Any)
    # Only the latest stored document supplies omitted values and legacy AI
    # conversion. Request-context preferences can be stale or query-overridden.
    effective = JSON.parse(Preferences.from_json(stored.to_json).to_json).as_h
    patch = parse(section, form, effective, locales)
    candidate = stored.merge(patch)
    canonical = JSON.parse(Preferences.from_json(candidate.to_json).to_json).as_h
    merged = merge(section, stored, canonical)
    Preferences.remove_retired_theme_fields(merged)
    merged
  end

  def self.save_account(email : String, section : String, form : URI::Params, locales : Array(String)) : String
    fields(section)
    Invidious::Database::Users.merge_preferences(email) do |conn, stored|
      merged = apply(section, form, stored, locales)
      if section == "library" && merged["save_player_pos"]?.try(&.as_bool) == false
        conn.exec("DELETE FROM playback_positions WHERE email = $1", email)
      end
      merged
    end
  end

  # `canonical` comes from parsing the candidate merged JSON with Preferences.
  # Copy only owned canonical keys back onto the raw latest JSON. Future/native
  # keys (including unknown entries inside enhancement maps) remain untouched.
  def self.merge(section : String, stored : Hash(String, JSON::Any), canonical : Hash(String, JSON::Any)) : Hash(String, JSON::Any)
    merged = stored.dup
    fields(section).each do |field|
      value = canonical[field]?
      value = JSON::Any.new(nil) if value.nil? && NULLABLE.includes?(field)
      next unless value
      if MERGED_MAPS.includes?(field)
        old = stored[field]?.try(&.as_h?) || {} of String => JSON::Any
        merged[field] = JSON::Any.new(old.merge(value.as_h))
      else
        merged[field] = value
      end
    end
    merged
  end

  def self.values(section : String, canonical : Hash(String, JSON::Any)) : Hash(String, JSON::Any)
    result = {} of String => JSON::Any
    fields(section).each do |field|
      if value = canonical[field]?
        result[field] = value
      elsif NULLABLE.includes?(field)
        result[field] = JSON::Any.new(nil)
      end
    end
    result
  end

  # Cached full-form callers still own their traditional checkboxes. Scalars,
  # arrays and retired native choices are sparse, and dedicated data is never
  # copied out of the request's potentially stale typed Preferences object.
  def self.merge_legacy(stored : Hash(String, JSON::Any), proposed : Preferences, form : URI::Params) : Hash(String, JSON::Any)
    canonical = JSON.parse(proposed.to_json).as_h
    latest = JSON.parse(Preferences.from_json(stored.to_json).to_json).as_h
    merged = stored.dup
    SECTIONS.each do |section, owned|
      next if section == "ai-filter" && form["ai_filter_form_version"]? != "2"
      owned.each do |field|
        next if field == "show_original_title" && form["show_original_title_present"]? != "1"
        if size = ARRAYS[field]?
          next unless (0...size).any? { |index| form.has_key?("#{field}[#{index}]") }
          old = latest[field]?.try(&.as_a?) || [] of JSON::Any
          values = (0...size).map do |index|
            JSON::Any.new(form["#{field}[#{index}]"]? || old[index]?.try(&.as_s?) || "")
          end
          values.reject! { |value| value.as_s.empty? } if field == "feed_menu"
          merged[field] = JSON::Any.new(values)
        elsif MERGED_MAPS.includes?(field)
          prefix = field == "sponsorblock_modes" ? "sponsorblock_mode_" : "sponsorblock_color_"
          values = (stored[field]?.try(&.as_h?) || {} of String => JSON::Any).dup
          Invidious::SponsorBlock::CATEGORIES.each_key do |category|
            next unless form.has_key?(prefix + category)
            values[category] = canonical[field].as_h[category]
          end
          merged[field] = JSON::Any.new(values) unless values.empty?
        elsif BOOLEANS.includes?(field) || form.has_key?(field)
          # Unchecked old-form checkboxes intentionally remain false.
          merged[field] = canonical[field]? || JSON::Any.new(nil)
        end
      end
    end
    legacy_ai_form = form["ai_filter_form_version"]? != "2" && (form.has_key?("ai_blocklist_action") || form.has_key?("ai_warnlist_action") || LEGACY_AI_SWITCHES.any? { |key| form.has_key?(key) })
    PRESERVED_ONLY.each do |field|
      owned = form.has_key?(field) || (field == "thin_mode" && form["thin_mode_present"]? == "1") || (legacy_ai_form && LEGACY_AI_SWITCHES.includes?(field))
      merged[field] = canonical[field] if owned && canonical.has_key?(field)
    end
    Preferences.remove_retired_theme_fields(merged)
    merged
  end
end

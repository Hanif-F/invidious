module Invidious::Frontend::Settings
  extend self

  CATEGORIES = {
    "appearance"        => {"overhaul_appearance", "sun"},
    "language"          => {"ui_language", "languages"},
    "browsing"          => {"ui_browsing_feeds", "house"},
    "playback"          => {"overhaul_playback", "play"},
    "captions-comments" => {"settings_captions_comments", "captions"},
    "library"           => {"ui_library", "list-video"},
    "sponsorblock"      => {"SponsorBlock", "shield"},
    "dearrow"           => {"DeArrow", "rotate-cw"},
    "ai-filter"         => {"settings_ai_filter", "filter"},
  }
  LABELS = {
    "dark_mode"                           => "preferences_color_mode_label",
    "ui_density"                          => "ui_density",
    "thin_mode"                           => "preferences_thin_mode_label",
    "locale"                              => "preferences_locale_label",
    "video_loop"                          => "preferences_video_loop_label",
    "preload"                             => "preferences_preload_label",
    "autoplay"                            => "preferences_autoplay_label",
    "continue"                            => "preferences_continue_label",
    "continue_autoplay"                   => "preferences_continue_autoplay_label",
    "local"                               => "preferences_local_label",
    "listen"                              => "preferences_listen_label",
    "save_player_pos"                     => "preferences_save_player_pos_label",
    "player_style"                        => "preferences_player_style_label",
    "speed"                               => "preferences_speed_label",
    "seek_seconds"                        => "preferences_seek_seconds_label",
    "video_codec"                         => "preferences_video_codec_label",
    "quality"                             => "preferences_quality_label",
    "quality_dash"                        => "preferences_quality_dash_label",
    "preferred_audio"                     => "preferences_preferred_audio_label",
    "annotations"                         => "preferences_annotations_label",
    "vr_mode"                             => "preferences_vr_mode_label",
    "default_home"                        => "preferences_default_home_label",
    "region"                              => "preferences_region_label",
    "show_original_title"                 => "preferences_show_original_title_label",
    "show_member_videos"                  => "Show members-only videos",
    "related_videos"                      => "preferences_related_videos_label",
    "extend_desc"                         => "preferences_extend_desc_label",
    "automatic_instance_redirect"         => "preferences_automatic_instance_redirect_label",
    "search_privacy"                      => "preferences_search_privacy_label",
    "sponsorblock_enabled"                => "preferences_sponsorblock_enabled_label",
    "dearrow_enabled"                     => "preferences_dearrow_enabled_label",
    "dearrow_show_original"               => "preferences_dearrow_show_original_label",
    "annotations_subscribed"              => "preferences_annotations_subscribed_label",
    "max_results"                         => "preferences_max_results_label",
    "sort"                                => "preferences_sort_label",
    "latest_only"                         => "Only show latest video from channel: ",
    "unseen_only"                         => "preferences_unseen_only_label",
    "notifications_only"                  => "preferences_notifications_only_label",
    "default_playlist"                    => "preferences_default_playlist",
    "timezone"                            => "history_timezone",
    "watch_history"                       => "preferences_watch_history_label",
    "show_nick"                           => "overhaul_show_nick",
    "admin_default_home"                  => "preferences_default_home_label",
    "popular_enabled"                     => "Popular enabled: ",
    "captcha_enabled"                     => "CAPTCHA enabled: ",
    "login_enabled"                       => "Login enabled: ",
    "login_required"                      => "Require login: ",
    "registration_enabled"                => "Registration enabled: ",
    "statistics_enabled"                  => "Report statistics: ",
    "modified_source_code_url"            => "adminprefs_modified_source_code_url_label",
    "captions"                            => "preferences_captions_label",
    "comments"                            => "preferences_comments_label",
    "feed_menu"                           => "preferences_feed_menu_label",
    "ai_filter_enabled"                   => "ai_filter_enabled_label",
    "ai_blocklist_feeds_action"           => "settings_ai_blocklist_feeds",
    "ai_blocklist_search_action"          => "settings_ai_blocklist_search",
    "ai_blocklist_recommendations_action" => "settings_ai_blocklist_recommendations",
    "ai_blocklist_other_pages_action"     => "settings_ai_blocklist_other_pages",
    "ai_warnlist_feeds_action"            => "settings_ai_warnlist_feeds",
    "ai_warnlist_search_action"           => "settings_ai_warnlist_search",
    "ai_warnlist_recommendations_action"  => "settings_ai_warnlist_recommendations",
    "ai_warnlist_other_pages_action"      => "settings_ai_warnlist_other_pages",
    "sponsorblock_modes"                  => "settings_segment_modes",
    "sponsorblock_colors"                 => "settings_segment_colors",
  }

  HINTS = {
    "seek_seconds"        => "preferences_seek_seconds_help",
    "video_codec"         => "preferences_video_codec_help",
    "preferred_audio"     => "preferences_preferred_audio_help",
    "show_original_title" => "preferences_show_original_title_help",
    "search_privacy"      => "preferences_search_privacy_description",
  }

  # These choices are public, static metadata. Never enumerate a user's saved
  # playlist titles or future account-derived options in the shared search index.
  SEARCH_OPTION_FIELDS = %w(dark_mode quality quality_dash video_codec comments captions default_home feed_menu sort region seek_seconds locale preferred_audio)

  def hint(locale : String, field : String) : String?
    HINTS[field]?.try { |key| I18n.translate(locale, key) }
  end

  def label(locale : String, field : String) : String
    I18n.translate(locale, LABELS[field]? || "preferences_#{field}_label")
  end

  # Only known historical IDs map to destinations. Do not interpret arbitrary
  # fragments as URLs or preference values. Keep this separate from write manifests.
  def legacy_destinations : Hash(String, String)
    result = {
      "preferences-appearance"       => "/preferences?section=appearance",
      "preferences-playback"         => "/preferences?section=playback",
      "preferences-browsing"         => "/preferences?section=browsing",
      "preferences-enhancements"     => "/preferences?section=sponsorblock",
      "preferences-library"          => "/preferences?section=library",
      "preferences-administration"   => "/admin/settings",
      "preferences-ai-filter"        => "/preferences?section=ai-filter",
      "preferences-channel-spoilers" => "/preferences/spoilers/channels",
      "dearrow-private-id"           => "/preferences/dearrow/identity?field=private_id",
      "dearrow-identity-hint"        => "/preferences/dearrow/identity?field=private_id",
      "dearrow-identity-form"        => "/preferences/dearrow/identity?field=private_id",
      "ui_density"                   => "/preferences?section=appearance&retired=layout",
      "thin_mode"                    => "/preferences?section=appearance&retired=layout",
      "player_style"                 => "/preferences?section=playback&retired=player",
    }
    Invidious::WebPreferences::SECTIONS.each do |section, fields|
      fields.each do |field|
        target = "/preferences?section=#{section}&field=#{URI.encode_www_form(field)}"
        result[field] = target
        result["#{field}_help"] = target
        if size = Invidious::WebPreferences::ARRAYS[field]?
          size.times do |index|
            name = "#{field}[#{index}]"
            result[name] = "/preferences?section=#{section}&field=#{URI.encode_www_form(name)}"
          end
        end
      end
    end
    Invidious::SponsorBlock::CATEGORIES.each_key do |category|
      {"mode", "color"}.each do |kind|
        name = "sponsorblock_#{kind}_#{category}"
        result[name] = "/preferences?section=sponsorblock&field=#{name}"
      end
    end
    {"blocklist", "warnlist"}.each do |kind|
      result["ai_#{kind}_action"] = "/preferences?section=ai-filter"
      {"feeds", "search", "recommendations", "other_pages"}.each do |scope|
        result["ai_#{kind}_#{scope}"] = "/preferences?section=ai-filter&field=ai_#{kind}_#{scope}_action"
        result["ai-filter-#{scope}-hint"] = "/preferences?section=ai-filter"
      end
    end
    {"ai-filter-master-hint", "ai-filter-actions-hint", "ai-filter-status"}.each do |id|
      result[id] = "/preferences?section=ai-filter"
    end
    result
  end

  def legacy_label(locale : String, destination : String) : String
    uri = URI.parse(destination)
    key = case uri.path
          when "/preferences/dearrow/identity"  then "overhaul_identity_heading"
          when "/preferences/spoilers/channels" then "spoilers_settings"
          when "/admin/settings"                then "admin_instance_settings"
          else
            section = URI::Params.parse(uri.query || "")["section"]? || "appearance"
            CATEGORIES[section][0]
          end
    I18n.translate(locale, key)
  end

  def saved(env) : Hash(String, JSON::Any)
    JSON.parse(env.get("settings_values").as(String)).as_h
  end

  def value(env, field : String, index : Int32? = nil) : String
    name = index ? "#{field}[#{index}]" : field
    if draft = env.get?("settings_draft").try(&.as(String))
      body = URI::Params.parse(draft)
      return body[name] if body.has_key?(name)
      return "off" if Invidious::WebPreferences::BOOLEANS.includes?(field)
    end
    entry = saved(env)[field]?
    entry = entry.try(&.as_a?).try(&.[index]?) if index
    return "" unless entry && !entry.raw.nil?
    entry.raw.is_a?(String) ? entry.as_s : entry.raw.to_s
  end

  def checked?(env, field : String) : Bool
    {"true", "on", "1"}.includes?(value(env, field))
  end

  def map_value(env, field : String, category : String) : String
    prefix = field == "sponsorblock_modes" ? "sponsorblock_mode_" : "sponsorblock_color_"
    if draft = env.get?("settings_draft").try(&.as(String))
      body = URI::Params.parse(draft)
      return body[prefix + category] if body.has_key?(prefix + category)
    end
    saved(env)[field]?.try(&.as_h?).try(&.[category]?).try(&.as_s?) || ""
  end

  def options(env, field : String) : Array(Tuple(String, String))
    locale = env.get("preferences").as(Preferences).locale
    values = case field
             when "dark_mode"                 then ["", "light", "dark"]
             when "quality"                   then %w(dash hd720 medium small)
             when "quality_dash"              then Invidious::NativePreferences::QUALITIES
             when "video_codec"               then %w(auto av1 h264)
             when "comments"                  then ["", "youtube", "reddit"]
             when "captions"                  then [""] + Invidious::Videos::Captions::LANGUAGES.to_a
             when "default_home", "feed_menu" then Invidious::NativePreferences::HOMES
             when "sort"                      then Invidious::NativePreferences::SORTS
             when "region"                    then [""] + I18n::CONTENT_REGIONS.to_a
             when "seek_seconds"              then Invidious::Videos::SeekPreferences::CHOICES.to_a.map(&.to_s)
             else                                  [] of String
             end
    case field
    when "locale"
      I18n::LOCALES_LIST.to_a.map { |key, name| {key, name} }
    when "preferred_audio"
      [{"original", I18n.translate(locale, "preferences_preferred_audio_option_original")}, {"original_stable", I18n.translate(locale, "preferences_preferred_audio_option_original_stable")}] + Invidious::Videos::AudioPreferences::LANGUAGES.to_a.map { |key, name| {key, I18n.translate(locale, name)} }
    when "seek_seconds"
      values.map { |entry| {entry, I18n.translate_count(locale, "generic_count_seconds", entry.to_i)} }
    when "default_playlist"
      user = env.get?("user").try(&.as(User))
      playlists = begin
        user ? Invidious::Database::Playlists.select_user_created_playlists(user.email) : [] of Tuple(String, String)
      rescue
        [] of Tuple(String, String)
      end
      [{"", I18n.translate(locale, "preferences_default_playlist_none")}] + playlists
    else
      if Invidious::NativePreferences::AI_ACTIONS.includes?(field)
        values = field.ends_with?("_other_pages_action") ? %w(off replace_thumbnail) : %w(off hide replace_thumbnail)
        return values.map { |entry| {entry, I18n.translate(locale, "settings_action_#{entry}")} }
      end
      values.map do |entry|
        key = case field
              when "dark_mode"                 then entry.empty? ? "preferences_color_system" : entry
              when "quality"                   then "preferences_quality_option_#{entry}"
              when "quality_dash"              then "preferences_quality_dash_option_#{entry}"
              when "video_codec"               then "preferences_video_codec_option_#{entry}"
              when "sort"                      then Invidious::Frontend::SubscriptionFeed::SORT_LABELS[entry]? || entry
              when "default_home", "feed_menu" then entry.empty? ? "Search" : entry
              else                                  entry.empty? ? "none" : entry
              end
        {entry, I18n.translate(locale, key)}
      end
    end
  end

  # Dedicated editors navigate as documents and keep their endpoint ownership.
  def search_index(env)
    locale = env.get("preferences").as(Preferences).locale
    entries = CATEGORIES.reject { |id, _| id == "library" && !env.get?("user") }.flat_map do |id, entry|
      Invidious::WebPreferences::SECTIONS[id].map do |field|
        {section: id, category: I18n.translate(locale, entry[0]), field: field, label: label(locale, field), navigation: "category", url: ""}
      end
    end
    chat_fields = {"chat_show_timestamps" => "ui_chat_show_timestamps", "chat_hide_user_ids" => "ui_chat_hide_user_ids", "chat_font_scale" => "ui_chat_font_size", "chat_width_px" => "ui_chat_size", "chat_user_blacklist" => "ui_chat_user_blacklist", "chat_word_blacklist" => "ui_chat_word_blacklist"}
    channel_entries = [{section: "sponsorblock-channels", category: "SponsorBlock", field: "channel", label: I18n.translate(locale, "sb_channels"), navigation: "document", url: "/preferences/sponsorblock/channels"}]
    mask_fields = {"channel" => "sb_channel_input", "hide_title" => "spoilers_hide_title", "hide_thumbnail" => "spoilers_hide_thumbnail", "reveal_after_days" => "spoilers_days"}
    mask_entries = mask_fields.map do |field, key|
      {section: "channel-masking", category: I18n.translate(locale, "spoilers_settings"), field: field, label: I18n.translate(locale, key), navigation: "document", url: "/preferences/spoilers/channels"}
    end
    block_fields = {"channels" => "overhaul_blocks_search", "unblock" => "Unblock channel"}
    block_entries = env.get?("user") ? block_fields.map do |field, key|
      {section: "blocked-channels", category: I18n.translate(locale, "Blocked channels"), field: field, label: I18n.translate(locale, key), navigation: "document", url: "/blocked_channels"}
    end : [] of NamedTuple(section: String, category: String, field: String, label: String, navigation: String, url: String)
    identity_entries = env.get?("user") ? [{section: "dearrow-identity", category: "DeArrow", field: "private_id", label: I18n.translate(locale, "overhaul_identity_heading"), navigation: "document", url: "/preferences/dearrow/identity"}] : [] of NamedTuple(section: String, category: String, field: String, label: String, navigation: String, url: String)
    all_entries = entries + channel_entries + mask_entries + block_entries + identity_entries + chat_fields.map do |field, key|
      {section: "chat", category: I18n.translate(locale, "ui_chat_replay"), field: field, label: I18n.translate(locale, key), navigation: "document", url: ""}
    end
    all_entries.map do |entry|
      field = entry[:field]
      description = if entry[:navigation] == "category"
                      hint(locale, field) || ""
                    else
                      key = case entry[:section]
                            when "chat"                  then env.get?("user") ? "overhaul_chat_storage_account" : "overhaul_chat_storage_guest"
                            when "channel-masking"       then "spoilers_hint"
                            when "sponsorblock-channels" then "sb_description"
                            when "dearrow-identity"      then "dearrow_identity_hint"
                            end
                      key ? I18n.translate(locale, key) : ""
                    end
      features = if entry[:navigation] == "category" && SEARCH_OPTION_FIELDS.includes?(field)
                   options(env, field).map(&.[1]).join(" ")
                 elsif {"sponsorblock_modes", "sponsorblock_colors"}.includes?(field)
                   Invidious::SponsorBlock::CATEGORIES.keys.map { |category| I18n.translate(locale, "sb_category_#{category}") }.join(" ")
                 else
                   ""
                 end
      entry.merge({description: description, features: features})
    end
  end
end

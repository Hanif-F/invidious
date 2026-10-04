require "json"
require "./sponsorblock"

# The native client exposes only preferences for capabilities it implements.
# Validate every field before the account transaction; retain all unrelated JSON.
module Invidious::NativePreferences
  BOOLEANS = %w(watch_history save_player_pos dearrow_enabled dearrow_show_original
    autoplay continue continue_autoplay video_loop listen local thin_mode related_videos extend_desc latest_only unseen_only notifications_only show_member_videos)
  SPONSORBLOCK = %w(sponsorblock_enabled sponsorblock_modes sponsorblock_colors sponsorblock_channel_overrides)
  HOMES        = ["", "Popular", "Trending", "Subscriptions", "Playlists"]
  SORTS        = ["published", "published - reverse", "alphabetically", "alphabetically - reverse", "channel name", "channel name - reverse"]
  QUALITIES    = %w(auto best 4320p 2160p 1440p 1080p 720p 480p 360p 240p 144p worst)

  def self.validate_patch(data : Hash(String, JSON::Any))
    raise "Empty preferences" if data.empty?
    sponsor = {} of String => JSON::Any
    data.each do |key, value|
      if BOOLEANS.includes?(key)
        value.as_bool
      elsif SPONSORBLOCK.includes?(key)
        sponsor[key] = value
      else
        case key
        when "speed"
          speed = value.as_f? || value.as_i64.to_f
          raise "Invalid speed" unless speed.finite? && (0.25..2.0).includes?(speed)
        when "quality_dash"
          raise "Invalid quality" unless QUALITIES.includes?(value.as_s)
        when "video_codec"
          raise "Invalid video codec" unless {"auto", "av1", "h264"}.includes?(value.as_s)
        when "dark_mode"
          raise "Invalid color mode" unless {"", "light", "dark"}.includes?(value.as_s)
        when "ui_density"
          raise "Invalid density" unless {"balanced", "compact"}.includes?(value.as_s)
        when "default_home"
          raise "Invalid homepage" unless value.raw.nil? || HOMES.includes?(value.as_s)
        when "feed_menu"
          menu = value.as_a
          raise "Invalid feed menu" unless menu.size <= 4 && menu.all? { |entry| HOMES.includes?(entry.as_s) }
        when "region"
          raise "Invalid region" unless value.as_s.matches?(/\A[A-Z]{2}\z/)
        when "captions"
          languages = value.as_a
          raise "Invalid captions" unless languages.size <= 3 && languages.all? { |entry| entry.as_s.matches?(/\A[\p{L}\p{N} _().-]{0,100}\z/) }
        when "comments"
          sources = value.as_a
          raise "Invalid comments" unless sources.size <= 2 && sources.all? { |entry| {"", "youtube", "reddit"}.includes?(entry.as_s) }
        when "max_results"
          raise "Invalid page size" unless (1..1500).includes?(value.as_i64)
        when "sort"
          raise "Invalid feed sorting" unless SORTS.includes?(value.as_s)
        when "default_playlist"
          raise "Invalid playlist" unless value.raw.nil? || value.as_s.matches?(/\A[A-Za-z0-9_-]{0,100}\z/)
        else
          raise "Unsupported native preference"
        end
      end
    end
    Invidious::SponsorBlock.validate_patch(sponsor)
  end
end

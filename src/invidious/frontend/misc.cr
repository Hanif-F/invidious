module Invidious::Frontend::Misc
  extend self

  # Playback and appearance changes do not invalidate browse continuations.
  # Visibility, locale and ordering changes do.
  def browse_fingerprint(preferences : Preferences) : String
    fields = %w(locale thin_mode search_privacy show_original_title dearrow_enabled dearrow_show_original
      show_member_videos channel_spoiler_settings ai_filter_enabled ai_blocklist_feeds_action ai_warnlist_feeds_action
      ai_blocklist_search_action ai_warnlist_search_action ai_blocklist_recommendations_action ai_warnlist_recommendations_action
      ai_blocklist_other_pages_action ai_warnlist_other_pages_action region sort max_results latest_only unseen_only notifications_only)
    selected = JSON.parse(preferences.to_json).as_h.select { |key, _value| fields.includes?(key) }
    OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, selected.to_json)
  end

  def redirect_url(env : HTTP::Server::Context)
    preferences = env.get("preferences").as(Preferences)

    if preferences.automatic_instance_redirect
      current_page = env.get?("current_page").as(String)
      return "/redirect?referer=#{current_page}"
    else
      return "https://redirect.invidious.io#{env.request.resource}"
    end
  end
end

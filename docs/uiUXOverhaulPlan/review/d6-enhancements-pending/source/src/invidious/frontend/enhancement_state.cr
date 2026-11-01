# Read-only browser projection. The original stores and preference manifests own
# writes; this projection never reads identities or resolves external metadata.
module Invidious::Frontend::EnhancementState
  extend self

  def snapshot(preferences : Preferences, profile : String, account : Bool, blocked : Array(String), secret : String, now = Time.utc)
    locale = I18n::LOCALES_LIST.has_key?(preferences.locale) ? preferences.locale : "en-US"
    blocked = account ? blocked.select(&.matches?(/\AUC[A-Za-z0-9_-]{22}\z/)).uniq.sort : [] of String
    rules = {} of String => NamedTuple(hide_title: Bool, hide_thumbnail: Bool, reveal_after_days: Int32?)
    overrides = {} of String => NamedTuple(enabled: Bool?, modes: Hash(String, String))
    if account
      preferences.channel_spoiler_settings.keys.sort.each do |id|
        rule = preferences.channel_spoiler_settings[id]
        rules[id] = {hide_title: rule.hide_title, hide_thumbnail: rule.hide_thumbnail, reveal_after_days: rule.reveal_after_days}
      end
      preferences.sponsorblock_channel_overrides.keys.sort.each do |id|
        rule = preferences.sponsorblock_channel_overrides[id]
        modes = rule.modes.keys.sort.to_h { |category| {category, rule.modes[category]} }
        overrides[id] = {enabled: rule.enabled, modes: modes}
      end
    end
    state = {
      version:            1,
      profile:            profile,
      account:            account,
      locale:             locale,
      browseFingerprint:  Misc.browse_fingerprint(preferences, blocked: blocked),
      historyFingerprint: Misc.browse_fingerprint(preferences, history: true, blocked: blocked),
      showMemberVideos:   preferences.show_member_videos,
      showOriginalTitle:  preferences.show_original_title,
      blockedChannels:    blocked,
      ai:                 Invidious::WebPreferences.values("ai-filter", JSON.parse(preferences.to_json).as_h),
      dearrow:            {enabled: preferences.dearrow_enabled, showOriginal: preferences.dearrow_show_original, originalLabel: I18n.translate(locale, "dearrow_reveal_original")},
      masking:            {rules: rules, labels: ChannelSpoilers.labels(locale)},
      sponsorblock:       {
        enabled: preferences.sponsorblock_enabled,
        modes: preferences.sponsorblock_modes,
        colors: preferences.sponsorblock_colors,
        overrides: overrides,
        labels: Invidious::SponsorBlock::CATEGORIES.to_h { |category, _| {category, I18n.translate(locale, "sb_category_#{category}")} },
        skip: I18n.translate(locale, "sb_skip"), skipped: I18n.translate(locale, "sb_skipped"), dismiss: I18n.translate(locale, "sb_dismiss"),
      },
    }
    # Clock advancement must not manufacture a configuration change. Clients use
    # server time to reevaluate upload-age boundaries separately from this hash.
    {state: state, now: now.to_unix, fingerprint: OpenSSL::HMAC.hexdigest(:sha256, secret, state.to_json)}
  end
end

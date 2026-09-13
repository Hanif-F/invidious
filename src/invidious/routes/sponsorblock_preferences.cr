{% skip_file if flag?(:api_only) %}

module Invidious::Routes::SponsorBlockPreferences
  PATH = "/preferences/sponsorblock/channels"

  def self.show(env)
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale
    user = env.get?("user").try &.as(User)
    channel_id = nil.as(String?)
    entry = Invidious::SponsorBlock::ChannelOverride.new("", nil, {} of String => String)
    csrf_token = ""
    if user
      csrf_token = generate_response(env.get("sid").as(String), {"POST:preferences/sponsorblock/channels"}, HMAC_KEY)
      if input = env.params.query["channel"]?
        channel_id = Invidious::SponsorBlock.channel_id(input)
        return error_template(400, I18n.translate(locale, "sb_channel_invalid")) unless channel_id
        if saved = preferences.sponsorblock_channel_overrides[channel_id]?
          entry = saved
        else
          begin
            channel = get_channel(channel_id)
            entry = Invidious::SponsorBlock::ChannelOverride.new(channel.author, nil, {} of String => String)
          rescue
            return error_template(502, I18n.translate(locale, "sb_channel_lookup_failed"))
          end
        end
      end
    end
    templated "user/sponsorblock_channels"
  end

  def self.update(env)
    user = env.get?("user").try &.as(User)
    return error_template(403, "Sign in to manage channel settings") unless user
    locale = user.preferences.locale
    begin
      validate_request(env.params.body["csrf_token"]?, env.get("sid").as(String), env.request, HMAC_KEY, locale)
    rescue
      return error_template(403, "Invalid CSRF token")
    end
    id = Invidious::SponsorBlock.channel_id(env.params.body["channel"]? || "")
    return error_template(400, I18n.translate(locale, "sb_channel_invalid")) unless id
    preferences = user.preferences
    if env.params.body["action"]? == "reset"
      preferences.sponsorblock_channel_overrides.delete(id)
    else
      enabled = case env.params.body["enabled"]?
                when "inherit" then nil
                when "true"    then true
                when "false"   then false
                else                return error_template(400, "Invalid SponsorBlock enablement")
                end
      modes = {} of String => String
      Invidious::SponsorBlock::CATEGORIES.each_key do |category|
        mode = env.params.body["mode_#{category}"]? || "inherit"
        next if mode == "inherit"
        return error_template(400, "Invalid SponsorBlock mode") unless {"auto", "manual", "marker", "disabled"}.includes?(mode)
        modes[category] = mode
      end
      if enabled.nil? && modes.empty?
        preferences.sponsorblock_channel_overrides.delete(id)
      else
        name = preferences.sponsorblock_channel_overrides[id]?.try &.name
        unless name
          begin
            name = get_channel(id).author
          rescue
            return error_template(502, I18n.translate(locale, "sb_channel_lookup_failed"))
          end
        end
        preferences.sponsorblock_channel_overrides[id] = Invidious::SponsorBlock::ChannelOverride.new(name, enabled, modes)
      end
    end
    user.preferences = preferences
    Invidious::Database::Users.update_preferences(user)
    env.redirect PATH
  end
end

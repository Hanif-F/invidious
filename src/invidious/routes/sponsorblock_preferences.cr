{% skip_file if flag?(:api_only) %}

module Invidious::Routes::SponsorBlockPreferences
  PATH = "/preferences/sponsorblock/channels"

  private def self.json?(env)
    env.params.query["format"]? == "json"
  end

  private def self.saved(env, raw : String? = nil)
    user = env.get?("user").try(&.as(User))
    raw ||= Invidious::Database::Users.preference_json(user.email) if user
    return {} of String => Invidious::SponsorBlock::ChannelOverride unless raw
    Invidious::SponsorBlock::ChannelOverrides.normalize(JSON.parse(raw)["sponsorblock_channel_overrides"]? || JSON::Any.new(nil))
  end

  private def self.state(env, raw : String? = nil)
    user = env.get?("user").try(&.as(User))
    token = user ? Invidious::Helpers::Tokens.generate_response(env.get("sid").as(String), {"POST:preferences/sponsorblock/channels"}, HMAC_KEY) : ""
    {overrides: saved(env, raw), profile: Invidious::BrowserProfiles.render_scope(env), csrf: token}.to_json
  end

  private def self.failure(env, code, message, uncertain = false, stale = false)
    env.response.status_code = code
    if json?(env)
      env.response.content_type = "application/json"
      return {error: message, profile: Invidious::BrowserProfiles.render_scope(env)}.to_json
    end
    env.set "sb_error", message
    env.set "sb_uncertain", uncertain
    env.set "sb_stale", stale
    env.set "sb_draft", env.params.body.to_s
    show(env)
  end

  def self.show(env)
    Authentication.no_store(env)
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale
    user = env.get?("user").try(&.as(User))
    if json?(env)
      env.response.content_type = "application/json"
      begin
        return state(env)
      rescue
        env.response.status_code = 503
        return {error: I18n.translate(locale, "settings_load_error")}.to_json
      end
    end
    channel_id = nil.as(String?)
    entry = Invidious::SponsorBlock::ChannelOverride.new("", nil, {} of String => String)
    csrf_token = user ? Invidious::Helpers::Tokens.generate_response(env.get("sid").as(String), {"POST:preferences/sponsorblock/channels"}, HMAC_KEY) : ""
    values = env.request.method == "POST" ? env.params.body : env.params.query
    if input = values["channel"]?
      channel_id = Invidious::SponsorBlock.channel_id(input)
      if channel_id
        if user && (existing = preferences.sponsorblock_channel_overrides[channel_id]?)
          entry = existing
        else
          entry = Invidious::SponsorBlock::ChannelOverride.new(channel_id, nil, {} of String => String)
          begin
            entry.name = Invidious::Channels::Channels.get_channel(channel_id).author
          rescue
            env.response.status_code = 502 if env.response.status_code < 400
            env.set "sb_error", I18n.translate(locale, "sb_channel_lookup_failed") unless env.get?("sb_error")
          end
        end
      else
        env.response.status_code = 400 if env.response.status_code < 400
        env.set "sb_error", I18n.translate(locale, "sb_channel_invalid") unless env.get?("sb_error")
      end
    end
    templated "user/sponsorblock_channels"
  end

  def self.update(env)
    Authentication.no_store(env)
    locale = env.get("preferences").as(Preferences).locale
    user = env.get?("user").try(&.as(User))
    return failure(env, 403, I18n.translate(locale, "Sign In"), stale: true) unless user
    if profile = env.params.body["browser_profile"]?
      return failure(env, 409, I18n.translate(locale, "overhaul_channel_profile_changed"), stale: true) unless profile == Invidious::BrowserProfiles.render_scope(env)
    end
    begin
      Invidious::Helpers::Tokens.validate_request(env.params.body["csrf_token"]?, env.get("sid").as(String), env.request, HMAC_KEY, locale)
    rescue
      return failure(env, 403, I18n.translate(locale, "overhaul_channel_session"))
    end
    id = Invidious::SponsorBlock.channel_id(env.params.body["channel"]? || "")
    return failure(env, 400, I18n.translate(locale, "sb_channel_invalid")) unless id
    action = env.params.body["action"]? || ""
    return failure(env, 400, I18n.translate(locale, "Invalid request")) unless {"save", "reset"}.includes?(action)
    override = nil.as(Invidious::SponsorBlock::ChannelOverride?)
    if action == "save"
      enabled = case env.params.body["enabled"]?
                when "inherit" then nil
                when "true"    then true
                when "false"   then false
                else                return failure(env, 400, I18n.translate(locale, "overhaul_channel_invalid"))
                end
      modes = {} of String => String
      Invidious::SponsorBlock::CATEGORIES.each_key do |category|
        mode = env.params.body["mode_#{category}"]? || "inherit"
        next if mode == "inherit"
        return failure(env, 400, I18n.translate(locale, "overhaul_channel_invalid")) unless {"auto", "manual", "marker", "disabled"}.includes?(mode)
        modes[category] = mode
      end
      name = user.preferences.sponsorblock_channel_overrides[id]?.try(&.name)
      if !name && (!enabled.nil? || !modes.empty?)
        begin
          name = Invidious::Channels::Channels.get_channel(id).author
        rescue
          return failure(env, 502, I18n.translate(locale, "sb_channel_lookup_failed"))
        end
      end
      override = Invidious::SponsorBlock::ChannelOverride.new(name || id, enabled, modes)
    end
    begin
      raw = Invidious::SponsorBlock.save_channel_override(user.email, id, override)
      current = user.preferences
      current.sponsorblock_channel_overrides = saved(env, raw)
      user.preferences = current
      env.set "user", user
      env.set "preferences", current
      if json?(env)
        env.response.content_type = "application/json"
        return state(env, raw)
      end
    rescue ex : ArgumentError
      return failure(env, 400, I18n.translate(locale, "overhaul_channel_invalid"))
    rescue
      return failure(env, 503, I18n.translate(locale, "overhaul_channel_unconfirmed"), uncertain: true)
    end
    env.redirect(action == "save" ? "#{PATH}?channel=#{id}&saved=1" : "#{PATH}?saved=1")
  end
end

{% skip_file if flag?(:api_only) %}

module Invidious::Routes::ChannelSpoilerPreferences
  PATH = "/preferences/spoilers/channels"

  private def self.json?(env)
    env.params.query["format"]? == "json"
  end

  private def self.saved(env, raw : String? = nil)
    user = env.get?("user").try(&.as(User))
    raw ||= Invidious::Database::Users.preference_json(user.email) if user
    return {} of String => Invidious::ChannelSpoilers::Rule unless raw
    Invidious::ChannelSpoilers::Rules.normalize(JSON.parse(raw)["channel_spoiler_settings"]? || JSON::Any.new(nil))
  end

  private def self.state(env, raw : String? = nil)
    user = env.get?("user").try(&.as(User))
    token = user ? Invidious::Helpers::Tokens.generate_response(env.get("sid").as(String), {"POST:preferences/spoilers/channels"}, HMAC_KEY) : ""
    {rules: saved(env, raw), profile: Invidious::BrowserProfiles.render_scope(env), csrf: token}.to_json
  end

  private def self.failure(env, code, message, uncertain = false, stale = false)
    env.response.status_code = code
    if json?(env)
      env.response.content_type = "application/json"
      return {error: message, profile: Invidious::BrowserProfiles.render_scope(env)}.to_json
    end
    env.set "mask_error", message
    env.set "mask_uncertain", uncertain
    env.set "mask_stale", stale
    env.set "mask_draft", env.params.body.to_s
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
        return {error: I18n.translate(locale, "overhaul_channel_load_failed")}.to_json
      end
    end
    channel_id = nil.as(String?)
    entry = Invidious::ChannelSpoilers::Rule.new
    csrf_token = user ? Invidious::Helpers::Tokens.generate_response(env.get("sid").as(String), {"POST:preferences/spoilers/channels"}, HMAC_KEY) : ""
    values = env.request.method == "POST" ? env.params.body : env.params.query
    if input = values["channel"]?
      channel_id = Invidious::SponsorBlock.channel_id(input)
      if channel_id
        if user && (existing = preferences.channel_spoiler_settings[channel_id]?)
          entry = existing
        else
          entry = Invidious::ChannelSpoilers::Rule.new(channel_id, false, false)
          begin
            entry.name = Invidious::Channels::Channels.get_channel(channel_id).author
          rescue
            env.response.status_code = 502 if env.response.status_code < 400
            env.set "mask_error", I18n.translate(locale, "sb_channel_lookup_failed") unless env.get?("mask_error")
          end
        end
      else
        env.response.status_code = 400 if env.response.status_code < 400
        env.set "mask_error", I18n.translate(locale, "sb_channel_invalid") unless env.get?("mask_error")
      end
    end
    templated "user/channel_spoilers"
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
    rule = nil.as(Invidious::ChannelSpoilers::Rule?)
    if action == "save"
      %w(hide_title hide_thumbnail).each do |field|
        value = env.params.body[field]?
        return failure(env, 400, I18n.translate(locale, "Invalid request")) if value && !{"on", "off"}.includes?(value)
      end
      title = env.params.body["hide_title"]? == "on"
      thumbnail = env.params.body["hide_thumbnail"]? == "on"
      text = (env.params.body["reveal_after_days"]? || "").strip
      days = text.empty? ? nil : text.to_i32?
      if !text.empty? && (!text.matches?(/\A\d+\z/) || days.nil? || days < 1)
        return failure(env, 400, I18n.translate(locale, "spoilers_invalid_days"))
      end
      name = user.preferences.channel_spoiler_settings[id]?.try(&.name)
      if !name && (title || thumbnail)
        begin
          name = Invidious::Channels::Channels.get_channel(id).author
        rescue
          return failure(env, 502, I18n.translate(locale, "sb_channel_lookup_failed"))
        end
      end
      rule = Invidious::ChannelSpoilers::Rule.new(name || id, title, thumbnail, days)
    end
    begin
      raw = Invidious::ChannelSpoilers.save_web_rule(user.email, id, rule)
      current = user.preferences
      current.channel_spoiler_settings = saved(env, raw)
      user.preferences = current
      env.set "user", user
      env.set "preferences", current
      if json?(env)
        env.response.content_type = "application/json"
        return state(env, raw)
      end
    rescue ex : ArgumentError
      return failure(env, 400, I18n.translate(locale, "overhaul_rule_invalid"))
    rescue
      return failure(env, 503, I18n.translate(locale, "overhaul_channel_unconfirmed"), uncertain: true)
    end
    env.redirect(action == "save" ? "#{PATH}?channel=#{id}&saved=1" : "#{PATH}?saved=1")
  end
end

{% skip_file if flag?(:api_only) %}

module Invidious::Routes::ChannelSpoilerPreferences
  PATH = "/preferences/spoilers/channels"

  def self.show(env)
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale
    user = env.get?("user").try(&.as(User))
    channel_id = nil.as(String?)
    entry = Invidious::ChannelSpoilers::Rule.new
    csrf_token = user ? generate_response(env.get("sid").as(String), {"POST:preferences/spoilers/channels"}, HMAC_KEY) : ""
    if input = env.params.query["channel"]?
      channel_id = Invidious::SponsorBlock.channel_id(input)
      return error_template(400, I18n.translate(locale, "sb_channel_invalid")) unless channel_id
      if saved = preferences.channel_spoiler_settings[channel_id]?
        entry = saved
      else
        begin
          entry.name = get_channel(channel_id).author
        rescue
          return error_template(502, I18n.translate(locale, "sb_channel_lookup_failed"))
        end
      end
    end
    templated "user/channel_spoilers"
  end

  def self.update(env)
    user = env.get?("user").try(&.as(User))
    return error_template(403, "Sign in to manage channel settings") unless user
    locale = user.preferences.locale
    begin
      validate_request(env.params.body["csrf_token"]?, env.get("sid").as(String), env.request, HMAC_KEY, locale)
    rescue
      return error_template(403, "Invalid CSRF token")
    end
    id = Invidious::SponsorBlock.channel_id(env.params.body["channel"]? || "")
    return error_template(400, I18n.translate(locale, "sb_channel_invalid")) unless id
    action = env.params.body["action"]?
    return error_template(400, "Invalid action") unless {"save", "reset"}.includes?(action)
    title = env.params.body["hide_title"]? == "on"
    thumbnail = env.params.body["hide_thumbnail"]? == "on"
    text = (env.params.body["reveal_after_days"]? || "").strip
    days = text.empty? ? nil : text.to_i32?
    if action == "save" && !text.empty? && (days.nil? || days < 1 || !text.matches?(/\A\d+\z/))
      return error_template(400, I18n.translate(locale, "spoilers_invalid_days"))
    end
    name = user.preferences.channel_spoiler_settings[id]?.try(&.name)
    if action == "save" && (title || thumbnail) && !name
      begin
        name = get_channel(id).author
      rescue
        return error_template(502, I18n.translate(locale, "sb_channel_lookup_failed"))
      end
    end
    # Read under the lock: editing one channel must preserve concurrent changes
    # to other channels and unrelated account preferences.
    PG_DB.transaction do |tx|
      conn = tx.connection
      raw = JSON.parse(conn.query_one("SELECT preferences FROM users WHERE email = $1 FOR UPDATE", user.email, as: String)).as_h
      saved = Invidious::ChannelSpoilers::Rules.normalize(raw["channel_spoiler_settings"]? || JSON::Any.new(nil))
      if action == "reset" || !(title || thumbnail)
        saved.delete(id)
      else
        saved[id] = Invidious::ChannelSpoilers::Rule.new(name || id, title, thumbnail, days)
      end
      raw["channel_spoiler_settings"] = JSON.parse(saved.to_json)
      conn.exec("UPDATE users SET preferences = $1 WHERE email = $2", raw.to_json, user.email)
    end
    env.redirect PATH
  end
end

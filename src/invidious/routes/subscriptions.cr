module Invidious::Routes::Subscriptions
  def self.toggle_subscription(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env, "/")

    redirect = env.params.query["redirect"]?
    redirect ||= "true"
    redirect = redirect == "true"

    if !user
      if redirect
        return env.redirect referer
      else
        return Errors.error_json(403, "No such user")
      end
    end

    user = user.as(User)
    sid = sid.as(String)
    token = env.params.body["csrf_token"]?

    begin
      Invidious::Helpers::Tokens.validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue ex
      if redirect
        return Errors.error_template(400, ex)
      else
        return Errors.error_json(400, ex)
      end
    end

    channel_id = env.params.query["c"]?
    channel_id ||= ""

    case action = env.params.query["action"]?
    when "create_subscription_to_channel"
      if !user.subscriptions.includes? channel_id
        Invidious::Channels::Channels.get_channel(channel_id)
        Invidious::Database::Users.subscribe_channel(user, channel_id)
      end
    when "remove_subscriptions"
      Invidious::Database::Users.unsubscribe_channel(user, channel_id)
    else
      return Errors.error_json(400, "Unsupported action #{action}")
    end

    if redirect
      env.redirect referer
    else
      env.response.content_type = "application/json"
      "{}"
    end
  end

  def self.subscription_manager(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    if !user
      return env.redirect referer
    end

    user = user.as(User)
    sid = sid.as(String)

    action_takeout = env.params.query["action_takeout"]?.try &.to_i?
    action_takeout ||= 0
    action_takeout = action_takeout == 1

    format = env.params.query["format"]?
    format ||= "rss"

    if action_takeout
      env.response.headers["Cache-Control"] = "private, no-store"
      export_time = Time.local.to_s("%Y%m%d%H%M")
      if format == "json"
        env.response.content_type = "application/json"
        env.response.headers["Content-Disposition"] = "attachment; filename=\"invidious_subscriptions_#{export_time}.json\""
        return Invidious::User::Export.to_invidious(user)
      elsif format == "newpipe_json"
        env.response.content_type = "application/json"
        env.response.headers["Content-Disposition"] = "attachment; filename=\"newpipe_subscriptions_#{export_time}\""
        channels = Invidious::RSS.subscription_channels(user.subscriptions)
        return Invidious::User::Export.to_newpipe(channels)
      else
        env.response.content_type = "application/xml"
        env.response.headers["Content-Disposition"] = "attachment; filename=\"invidious_subscriptions_#{export_time}.opml\""
        if format == "opml"
          return Invidious::User::Export.to_freetube_opml(Invidious::RSS.subscription_channels(user.subscriptions))
        end
        return Invidious::RSS.subscriptions(user.subscriptions, format)
      end
    end

    now = Time.utc
    sort_by = Frontend::SubscriptionManager.preference(env, !!(Kemal.config.ssl || CONFIG.https_only))
    subscription_stats = Database::SubscriptionManager.select(user, env.get("preferences").as(Preferences).show_member_videos, now)
    subscriptions = Frontend::SubscriptionManager.sort(Database::Channels.select(user.subscriptions), subscription_stats, sort_by, now)
    env.response.headers["Cache-Control"] = "private, no-store"

    templated "user/subscription_manager"
  end
end

{% skip_file if flag?(:api_only) %}

module Invidious::Routes::Feeds
  def self.view_all_playlists_redirect(env)
    env.redirect "/feed/playlists"
  end

  def self.playlists(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    referer = get_referer(env)

    return env.redirect "/" if user.nil?

    user = user.as(User)

    # TODO: make a single DB call and separate the items here?
    items_created = Invidious::Database::Playlists.select_like_iv(user.email)
    items_created.map! do |item|
      item.author = ""
      item
    end

    items_saved = Invidious::NativePlaylists.items(user.email)

    templated "feeds/playlists"
  end

  def self.popular(env)
    locale = env.get("preferences").as(Preferences).locale

    if CONFIG.popular_enabled
      templated "feeds/popular"
    else
      message = I18n.translate(locale, "The Popular feed has been disabled by the administrator.")
      templated "message"
    end
  end

  def self.trending(env)
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale

    trending_type = env.params.query["type"]?
    trending_type ||= "Default"

    region = env.params.query["region"]?
    region ||= preferences.region

    begin
      trending, plid = fetch_trending(trending_type, region, locale)
    rescue ex
      return error_template(500, ex)
    end

    trending = Frontend::BlockedChannels.filter(trending, Frontend::BlockedChannels.ids(env))
    templated "feeds/trending"
  end

  def self.subscriptions(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    if !user
      return env.redirect referer
    end

    user = user.as(User)
    sid = sid.as(String)
    token = user.token

    if user.preferences.unseen_only
      env.set "show_watched", true
    end

    # Refresh account
    headers = HTTP::Headers.new
    headers["Cookie"] = env.request.headers["Cookie"]

    max_results = env.params.query["max_results"]?.try &.to_i?.try &.clamp(0, MAX_ITEMS_PER_PAGE)
    max_results ||= user.preferences.max_results
    max_results ||= CONFIG.default_user_preferences.max_results

    page = env.params.query["page"]?.try &.to_i?
    page ||= 1

    videos, notifications = get_subscription_feed(user, max_results, page)

    if CONFIG.enable_user_notifications
      # "updated" here is used for delivering new notifications, so if
      # we know a user has looked at their feed e.g. in the past 10 minutes,
      # they've already seen a video posted 20 minutes ago, and don't need
      # to be notified.
      Invidious::Database::Users.clear_notifications(user)
      user.notifications = [] of String
    end
    env.set "user", user

    # Used for pagination links
    base_url = "/feed/subscriptions"
    base_url += "?max_results=#{max_results}" if env.params.query.has_key?("max_results")

    templated "feeds/subscriptions"
  end

  def self.history(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    referer = get_referer(env)

    page = env.params.query["page"]?.try &.to_i?
    page ||= 1

    if !user
      return env.redirect referer
    end

    user = user.as(User)

    max_results = env.params.query["max_results"]?.try &.to_i?.try &.clamp(0, MAX_ITEMS_PER_PAGE)
    max_results ||= user.preferences.max_results
    max_results ||= CONFIG.default_user_preferences.max_results

    page = page.clamp(1, Int32::MAX)
    history_today = Invidious::History.today(user.preferences.timezone)
    history_query = (env.params.query["q"]? || "").strip
    history_entries = Invidious::History.organize(IV::Database::WatchHistory.entries(user), user.watched, history_query, history_today)
    history_count = history_entries.size
    watched = Invidious::History.page(history_entries, page, max_results)

    # Used for pagination links
    history_params = URI::Params.new
    history_params["max_results"] = max_results.to_s if env.params.query.has_key?("max_results")
    history_clear_url = "/feed/history"
    history_clear_url += "?#{history_params}" unless history_params.empty?
    history_params["q"] = history_query unless history_query.empty?
    base_url = "/feed/history"
    base_url += "?#{history_params}" unless history_params.empty?

    templated "feeds/history"
  end

  # RSS feeds

  # Push notifications via PubSub

  def self.push_notifications_get(env)
    verify_token = env.params.url["token"]

    mode = env.params.query["hub.mode"]?
    topic = env.params.query["hub.topic"]?
    challenge = env.params.query["hub.challenge"]?

    if !mode || !topic || !challenge
      haltf env, status_code: 400
    else
      mode = mode.not_nil!
      topic = topic.not_nil!
      challenge = challenge.not_nil!
    end

    case verify_token
    when .starts_with? "v1"
      _, time, nonce, signature = verify_token.split(":")
      data = "#{time}:#{nonce}"
    when .starts_with? "v2"
      time, signature = verify_token.split(":")
      data = "#{time}"
    else
      haltf env, status_code: 400
    end

    # The hub will sometimes check if we're still subscribed after delivery errors,
    # so we reply with a 200 as long as the request hasn't expired
    if Time.utc.to_unix - time.to_i > 432000
      haltf env, status_code: 400
    end

    if OpenSSL::HMAC.hexdigest(:sha1, HMAC_KEY, data) != signature
      haltf env, status_code: 400
    end

    if ucid = HTTP::Params.parse(URI.parse(topic).query.not_nil!)["channel_id"]?
      Invidious::Database::Channels.update_subscription_time(ucid)
    elsif plid = HTTP::Params.parse(URI.parse(topic).query.not_nil!)["playlist_id"]?
      Invidious::Database::Playlists.update_subscription_time(plid)
    else
      haltf env, status_code: 400
    end

    env.response.status_code = 200
    challenge
  end

  def self.push_notifications_post(env)
    locale = env.get("preferences").as(Preferences).locale

    body = env.request.body.not_nil!.gets_to_end
    signature = env.request.headers["X-Hub-Signature"].lchop("sha1=")

    if signature != OpenSSL::HMAC.hexdigest(:sha1, HMAC_KEY, body)
      LOGGER.error("/feed/webhook/[REDACTED] : Invalid signature")
      haltf env, status_code: 200
    end

    spawn do
      # TODO: unify this with the other almost identical looking parts in this and channels.cr somehow?
      namespaces = {
        "yt"      => "http://www.youtube.com/xml/schemas/2015",
        "default" => "http://www.w3.org/2005/Atom",
      }
      rss = XML.parse(body)
      rss.xpath_nodes("//default:feed/default:entry", namespaces).each do |entry|
        id = entry.xpath_node("yt:videoId", namespaces).not_nil!.content
        author = entry.xpath_node("default:author/default:name", namespaces).not_nil!.content
        published = Time.parse_rfc3339(entry.xpath_node("default:published", namespaces).not_nil!.content)
        updated = Time.parse_rfc3339(entry.xpath_node("default:updated", namespaces).not_nil!.content)

        begin
          video = get_video(id, force_refresh: true)
        rescue
          next # skip this video since it raised an exception (e.g. it is a scheduled live event)
        end

        video = ChannelVideo.new({
          id:                 id,
          title:              video.title,
          published:          published,
          updated:            updated,
          ucid:               video.ucid,
          author:             author,
          length_seconds:     video.length_seconds,
          live_now:           video.live_now,
          members_only:       video.members_only,
          premiere_timestamp: video.premiere_timestamp,
          views:              video.views,
        })

        was_insert = Invidious::Database::ChannelVideos.insert(video, with_premiere_timestamp: true)
        if was_insert
          NOTIFICATION_CHANNEL.send(VideoNotification.from_video(video))
        end
      end
    end

    env.response.status_code = 200
  end
end

{% skip_file if flag?(:api_only) %}

module Invidious::Routes::Watch
  def self.handle(env)
    return enhancements(env) if env.params.query["format"]? == "enhancements"
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale
    region = env.params.query["region"]?
    native_clip_id = env.get?("native_clip_id").try(&.as(String))
    native_clip = env.get?("native_clip_id").try(&.as(String)).try { |clip_id| Database::Clips.select(clip_id) }
    return Errors.error_template(404, "Clip not found.") if native_clip_id && !native_clip
    preview_clip = env.params.query["clip_preview"]? == "1"
    if native_clip
      %w[t start end time_continue list index occurrence continuation raw clip_preview].each { |key| env.params.query.delete_all(key) }
      env.params.query["v"] = native_clip.video_id
      env.set "native_clip_title", native_clip.title
    end

    # Normalize accidental spaces in the video ID without rewriting opaque
    # comment/playlist cursors or any other query value.
    if requested_id = env.params.query["v"]?
      if requested_id.includes?(' ')
        env.params.query["v"] = requested_id.delete(' ')
        return env.redirect "#{native_clip ? native_clip.permalink : "/watch"}?#{env.params.query}"
      end
    end

    if env.params.query["v"]?
      id = env.params.query["v"]

      if env.params.query["v"].empty?
        return Errors.error_template(400, "Invalid parameters.")
      end

      unless validate_video_id(id)
        return Errors.error_template(400, InvalidVideoID.new(id))
      end
    else
      return env.redirect "/"
    end

    plid = env.params.query["list"]?.try &.gsub(/[^a-zA-Z0-9_-]/, "")
    continuation = Invidious::Frontend::WatchPage.playlist_cursor(env, plid, id)

    nojs = env.params.query["nojs"]?

    nojs ||= "0"
    nojs = nojs == "1"

    user = env.get?("user").try &.as(User)
    if user
      subscriptions = user.subscriptions
      watched = user.watched
      notifications = user.notifications
    end
    subscriptions ||= [] of String

    params = Invidious::Videos.process_video_params(env.params.query, preferences)
    env.params.query.delete_all("listen")

    begin
      video = get_video(id, region: params.region)
    rescue ex : NotFoundException
      return Routes::Clips.unavailable(env, native_clip) if native_clip
      LOGGER.error("get_video not found: #{id} : #{ex.message}")
      return Errors.error_template(404, ex)
    rescue ex
      return Routes::Clips.unavailable(env, native_clip) if native_clip
      LOGGER.error("get_video: #{id} : #{ex.message}")
      return Errors.error_template(500, ex)
    end

    if native_clip || preview_clip
      if error = Invidious::Clips.source_error(video)
        return Routes::Clips.unavailable(env, native_clip) if native_clip
        return Errors.error_template(400, error)
      end
      begin
        clip_start_ms = native_clip ? native_clip.start_ms : Invidious::Clips::Validation.milliseconds(env.params.query["start"]? || "")
        clip_end_ms = native_clip ? native_clip.end_ms : Invidious::Clips::Validation.milliseconds(env.params.query["end"]? || "")
        Invidious::Clips::Validation.range(clip_start_ms, clip_end_ms, video.length_seconds)
      rescue ex : ArgumentError
        return Routes::Clips.unavailable(env, native_clip) if native_clip
        return Errors.error_template(400, ex)
      end
      params.video_start = clip_start_ms / 1000.0
      params.video_end = clip_end_ms / 1000.0
      params.video_loop = true unless env.params.query.has_key?("loop")
      params.save_player_pos = false
      params.continue = false
      params.continue_autoplay = false
      params.raw = false
      plid = nil
      continuation = nil
    end

    related_videos = Frontend::WatchEnhancements.recommendations(env, video)

    if preferences.annotations_subscribed &&
       subscriptions.includes?(video.ucid) &&
       (env.params.query["iv_load_policy"]? || "1") == "1"
      params.annotations = true
    end
    env.params.query.delete_all("iv_load_policy")

    if watched && preferences.watch_history
      Invidious::Database::Users.mark_watched(user.as(User), id, video)
    end

    playback_sync = !native_clip && !preview_clip && !!user && user.preferences.save_player_pos && params.save_player_pos && !video.live_now
    env.response.headers["Cache-Control"] = "private, no-store" if playback_sync
    playback_position = playback_sync ? Invidious::Database::PlaybackPositions.select(user.not_nil!.email, id).try(&.[:position_seconds]) : nil
    chat_timing_ms = user && video.live_chat_replay? ? Invidious::Database::ChatTimingOffsets.select(user.email, id) : 0

    if CONFIG.enable_user_notifications && notifications && notifications.includes? id
      Invidious::Database::Users.remove_notification(user.as(User), id)
      env.get("user").as(User).notifications.delete(id)
      notifications.delete(id)
    end

    if nojs
      if params.comments.includes?("youtube") && video.comments?
        comment_cursor = env.params.query["comments_continuation"]?
        comment_sort = env.params.query["comments_sort"]? || "top"
        comment_sort = "top" unless {"top", "new"}.includes?(comment_sort)
        begin
          comment_html = JSON.parse(Comments.fetch_youtube(id, comment_cursor, "html", locale, preferences.thin_mode, region, sort_by: comment_sort))["contentHtml"]
        rescue
          comment_html = ""
        end
      end

      comment_html ||= ""
      if native_clip
        comment_html = comment_html.to_s.gsub(%(href="/watch?v=#{id}&amp;nojs=1&amp;), %(href="#{native_clip.permalink}?nojs=1&amp;))
      end
    end

    fmt_stream = video.fmt_stream
    adaptive_fmts = video.adaptive_fmts

    if params.local
      fmt_stream.each { |fmt| fmt["url"] = JSON::Any.new(HttpServer::Utils.proxy_video_url(fmt["url"].as_s)) }
    end

    # Always proxy DASH streams, otherwise youtube CORS headers will prevent playback
    adaptive_fmts.each { |fmt| fmt["url"] = JSON::Any.new(HttpServer::Utils.proxy_video_url(fmt["url"].as_s)) }

    video_streams = video.video_streams
    audio_streams = video.audio_streams

    # Videos that are a premiere do not have audio streams.
    if video.premiere_timestamp.nil?
      # Older videos may not have audio sources available.
      # We redirect here so they're not unplayable
      if audio_streams.empty? && !video.live_now
        if params.quality == "dash"
          env.params.query.delete_all("quality")
          env.params.query["quality"] = "medium"
          return env.redirect "#{native_clip ? native_clip.permalink : "/watch"}?#{env.params.query}"
        elsif params.listen
          env.params.query.delete_all("listen")
          env.params.query["listen"] = "0"
          return env.redirect "#{native_clip ? native_clip.permalink : "/watch"}?#{env.params.query}"
        end
      end
    end

    captions = video.captions

    preferred_captions = captions.select do |caption|
      params.preferred_captions.includes?(caption.name) ||
        params.preferred_captions.includes?(caption.language_code.split("-")[0])
    end
    preferred_captions.sort_by! do |caption|
      (params.preferred_captions.index(caption.name) ||
        params.preferred_captions.index(caption.language_code.split("-")[0])).not_nil!
    end
    captions = captions - preferred_captions

    aspect_ratio = "16:9"

    thumbnail = "/vi/#{video.id}/maxres.jpg"

    if params.raw
      if params.listen
        audio_streams = Invidious::Videos::AudioPreferences.select(audio_streams, params.preferred_audio)
        url = audio_streams[0]["url"].as_s

        if params.quality.ends_with? "k"
          audio_streams.each do |fmt|
            if fmt["bitrate"].as_i == params.quality.rchop("k").to_i
              url = fmt["url"].as_s
            end
          end
        end
      else
        url = fmt_stream[0]["url"].as_s

        fmt_stream.each do |fmt|
          if fmt["quality"].as_s == params.quality
            url = fmt["url"].as_s
          end
        end
      end

      return env.redirect url
    end

    # Structure used for the download widget
    video_assets = Invidious::Frontend::WatchPage::VideoAssets.new(
      full_videos: fmt_stream,
      video_streams: video_streams,
      audio_streams: audio_streams,
      captions: video.captions
    )

    if CONFIG.invidious_companion.present?
      invidious_companion = CONFIG.invidious_companion.sample
    end

    templated "watch"
  end

  # Optional read for the existing watch document. A cache miss is unavailable,
  # never a hidden video/stream fetch or a second watch/history mutation.
  def self.enhancements(env)
    Authentication.no_store(env)
    env.response.content_type = "application/json"
    id = env.params.query["v"]? || ""
    ids = (env.params.query["ids"]? || "").split(',', remove_empty: true).uniq
    channels = (env.params.query["channels"]? || "").split(',', remove_empty: true).uniq
    return Errors.error_json(400, "Invalid watch presentation request.") unless validate_video_id(id) && ids.size <= 200 && channels.size <= 200 &&
                                                                                ids.all? { |value| validate_video_id(value) } && channels.all?(&.matches?(/\AUC[A-Za-z0-9_-]{22}\z/))
    user = env.get?("user").try(&.as(User))
    preferences = PreferencesRoute.runtime_preferences(env)
    blocked = user ? Database::BlockedChannels.ids(user.email) : [] of String
    fingerprint = Frontend::Misc.browse_fingerprint(preferences, blocked: blocked)
    return Errors.error_json(409, "Enhancement settings changed. Check them again.") unless env.params.query["owner"]? == fingerprint
    env.set "preferences", preferences
    env.set "blocked_channels", blocked
    video = Database::Videos.select(id)
    return Errors.error_json(503, "Cached watch information is unavailable. Try again.") unless video
    result = Frontend::WatchEnhancements.projection(env, video, ids, channels, env.params.query["listen"]? == "1")
    result.merge({profile: Invidious::BrowserProfiles.render_scope(env), browseFingerprint: fingerprint}).to_json
  rescue DB::NoResultsError
    Errors.error_json(403, "This account is no longer available. Reload to sign in again.")
  rescue
    Errors.error_json(503, "Watch information could not be checked. Try again.")
  end

  def self.redirect(env)
    url = "/watch?v=#{env.params.url["id"]}"
    if env.params.query.size > 0
      url += "&#{env.params.query}"
    end

    return env.redirect url
  end

  def self.mark_watched(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env, "/feed/subscriptions")

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

    id = env.params.query["id"]?
    unless id && validate_video_id(id)
      env.response.status_code = 400
      return
    end

    begin
      Invidious::Helpers::Tokens.validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue ex
      if redirect
        return Errors.error_template(400, ex)
      else
        return Errors.error_json(400, ex)
      end
    end

    case action = env.params.query["action"]?
    when "mark_watched"
      Invidious::Database::Users.mark_watched(user, id)
    when "mark_unwatched"
      Invidious::Database::Users.mark_unwatched(user, id)
    when "set_progress"
      return Errors.error_json(409, "Saving playback position is disabled in preferences.") unless user.preferences.save_player_pos
      return Errors.error_json(400, "Invalid video id.") unless id.match(/^[a-zA-Z0-9_-]{11}$/)

      position = env.params.body["position"]?.try &.to_i?
      return Errors.error_json(400, "Invalid playback position.") unless position && position >= 0

      Invidious::Database::PlaybackPositions.upsert(user.email, id, position)
    when "clear_progress"
      return Errors.error_json(400, "Invalid video id.") unless id.match(/^[a-zA-Z0-9_-]{11}$/)

      Invidious::Database::PlaybackPositions.delete(user.email, id)
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

  def self.clip(env)
    clip_id = env.params.url["clip"]?

    return Errors.error_template(400, "A clip ID is required") if !clip_id

    if Invidious::Clips::Validation.native?(clip_id)
      env.set "native_clip_id", clip_id
      return handle(env)
    end

    response = YoutubeAPI.resolve_url("https://www.youtube.com/clip/#{clip_id}")
    return Errors.error_template(400, "Invalid clip ID") if response["error"]?

    if video_id = response.dig?("endpoint", "watchEndpoint", "videoId")
      if params = response.dig?("endpoint", "watchEndpoint", "params").try &.as_s
        start_time, end_time, _ = Invidious::Videos::Clip.parse_clip_parameters(params)
        env.params.query["start"] = start_time.to_s if start_time != nil
        env.params.query["end"] = end_time.to_s if end_time != nil
      end

      return env.redirect "/watch?v=#{video_id}&#{env.params.query}"
    else
      return Errors.error_template(404, "The requested clip doesn't exist")
    end
  end

  def self.download(env)
    if CONFIG.disabled?("downloads")
      return Errors.error_template(403, "Administrator has disabled this endpoint.")
    end
    if CONFIG.invidious_companion.present?
      return Errors.error_template(403, "Downloads should be routed through Companion when present")
    end

    title = env.params.body["title"]? || ""
    video_id = env.params.body["id"]? || ""
    selection = env.params.body["download_widget"]?

    if title.empty? || video_id.empty? || selection.nil?
      return Errors.error_template(400, "Missing form data")
    end

    download_widget = JSON.parse(selection)

    extension = download_widget["ext"].as_s
    filename = "#{title}-#{video_id}.#{extension}"

    # Delete the now useless URL parameters
    env.params.body.delete("id")
    env.params.body.delete("title")
    env.params.body.delete("download_widget")

    # Pass form parameters as URL parameters for the handlers of both
    # /latest_version and /api/v1/captions. This avoids an un-necessary
    # redirect and duplicated (and hazardous) sanity checks.
    if label = download_widget["label"]?
      # URL params specific to /api/v1/captions/:id
      env.params.url["id"] = video_id
      env.params.query["title"] = filename
      env.params.query["label"] = URI.decode_www_form(label.as_s)

      return Invidious::Routes::API::V1::Videos.captions(env)
    elsif itag = download_widget["itag"]?.try &.as_i.to_s
      # URL params specific to /latest_version
      env.params.query["id"] = video_id
      env.params.query["title"] = filename
      env.params.query["local"] = "true"

      return Invidious::Routes::VideoPlayback.latest_version(env)
    else
      return Errors.error_template(400, "Invalid label or itag")
    end
  end
end

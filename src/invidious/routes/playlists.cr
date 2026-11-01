{% skip_file if flag?(:api_only) %}

module Invidious::Routes::Playlists
  def self.new(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    return env.redirect "/" if user.nil?

    user = user.as(User)
    sid = sid.as(String)
    csrf_token = Invidious::Helpers::Tokens.generate_response(sid, {":create_playlist"}, HMAC_KEY)

    templated "create_playlist"
  end

  def self.create(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    json_response = env.params.query["redirect"]? == "false"
    if user.nil?
      return Errors.error_json(403, "No such user") if json_response
      return env.redirect "/"
    end

    user = user.as(User)
    sid = sid.as(String)
    token = env.params.body["csrf_token"]?

    begin
      Invidious::Helpers::Tokens.validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue
      return form_failure(env, "Invalid CSRF token")
    end

    if invalid = Frontend::PlaylistForms.validate(env.params.body)
      return form_failure(env, I18n.translate(locale, invalid[1]), invalid[0])
    end
    title = env.params.body["title"].strip
    privacy = PlaylistPrivacy.parse(env.params.body["privacy"])
    if Invidious::Database::Playlists.count_owned_by(user.email) >= 100
      return form_failure(env, I18n.translate(locale, "overhaul_playlist_limit"))
    end

    begin
      playlist = Invidious::Playlists::Playlists.create_playlist(title, privacy, user)
    rescue ex : InfoException
      return form_failure(env, I18n.translate(locale, "overhaul_playlist_limit"))
    rescue
      # A connection failure cannot establish whether the INSERT committed.
      return form_failure(env, I18n.translate(locale, "overhaul_creation_uncertain"), status: 503, uncertain: true)
    end

    if env.params.query["redirect"]? == "false"
      env.response.content_type = "application/json"
      return {"playlistId" => playlist.id, "title" => playlist.title}.to_json
    end
    env.redirect "/playlist?list=#{playlist.id}"
  end

  def self.form_failure(env, message : String, field = "", playlist : InvidiousPlaylist? = nil, status = 400, uncertain = false)
    env.response.status_code = status
    if env.params.query["redirect"]? == "false"
      env.response.content_type = "application/json"
      return {"error" => message, "field" => field, "uncertain" => uncertain}.to_json
    end
    locale = env.get("preferences").as(Preferences).locale
    referer = get_referer(env)
    sid = env.get("sid").as(String)
    env.set "playlist_form_error", message
    env.set "playlist_form_field", field
    env.set "playlist_form_uncertain", uncertain
    if playlist
      plid = playlist.id
      csrf_token = Invidious::Helpers::Tokens.generate_response(sid, {":edit_playlist"}, HMAC_KEY)
      templated "edit_playlist"
    else
      csrf_token = Invidious::Helpers::Tokens.generate_response(sid, {":create_playlist"}, HMAC_KEY)
      templated "create_playlist"
    end
  end

  def self.subscribe(env)
    return Errors.error_template(403, "Invalid CSRF token") unless Authentication.valid_session_csrf?(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    referer = get_referer(env)

    return env.redirect "/" if user.nil?

    user = user.as(User)

    playlist_id = env.params.query["list"]
    begin
      fields = Invidious::NativePlaylists.resolve(playlist_id, user.email, env.params.query["continuation"]?)
    rescue ex : NotFoundException
      return Errors.error_template(404, ex)
    rescue ex : InfoException
      return Errors.error_template(400, ex)
    rescue ex
      return Errors.error_template(500, ex)
    end
    Database::SavedPlaylists.save(user.email, fields)

    if playlist_id.starts_with?("RD")
      env.redirect "/mix?list=#{playlist_id}&continuation=#{fields["seedVideoId"].as_s}"
    else
      env.redirect "/playlist?list=#{playlist_id}"
    end
  end

  def self.delete_page(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    return env.redirect "/" if user.nil?

    user = user.as(User)
    sid = sid.as(String)

    plid = env.params.query["list"]?
    if !plid || plid.empty?
      return Errors.error_template(400, "A playlist ID is required")
    end

    playlist = Invidious::Database::Playlists.select(id: plid)
    subscribed = Database::SavedPlaylists.exists?(user.email, plid)
    if subscribed && (!playlist || playlist.author != user.email)
      cached = Database::SavedPlaylists.list(user.email).find! { |item| item["playlistId"].as_s == plid }
      playlist = InvidiousPlaylist.new({id: plid, title: cached["title"].as_s, author: user.email,
                                        description: "", video_count: 0, created: Time.utc, updated: Time.utc,
                                        privacy: PlaylistPrivacy::Private, index: [] of Int64})
    end
    if !playlist || playlist.author != user.email
      return env.redirect referer
    end

    csrf_token = Invidious::Helpers::Tokens.generate_response(sid, {":delete_playlist"}, HMAC_KEY)

    templated "delete_playlist"
  end

  def self.delete(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    return env.redirect "/" if user.nil?

    plid = env.params.query["list"]?
    return env.redirect referer if plid.nil?

    user = user.as(User)
    sid = sid.as(String)
    token = env.params.body["csrf_token"]?

    begin
      Invidious::Helpers::Tokens.validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue ex
      return Errors.error_template(400, ex)
    end

    operation = env.params.body["operation"]?
    unless operation.nil? || {"unsave", "delete"}.includes?(operation)
      return Errors.error_template(400, "Invalid playlist operation")
    end
    unsave = operation == "unsave" || (operation.nil? && (Database::SavedPlaylists.exists?(user.email, plid) || !plid.starts_with?("IV")))
    if unsave
      Database::SavedPlaylists.delete(user.email, plid)
      return env.redirect "/feed/playlists"
    end

    playlist = Invidious::Database::Playlists.select(id: plid)
    if !playlist || !plid.starts_with?("IV") || playlist.author != user.email
      return Errors.error_template(403, "Only owned playlists can be deleted")
    end

    Invidious::Database::Playlists.delete(plid)

    env.redirect "/feed/playlists"
  end

  def self.edit(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    return env.redirect "/" if user.nil?

    user = user.as(User)
    sid = sid.as(String)

    plid = env.params.query["list"]?
    if !plid || !plid.starts_with?("IV")
      return env.redirect referer
    end

    playlist = Invidious::Database::Playlists.select(id: plid)
    if !playlist || playlist.author != user.email
      return env.redirect referer
    end
    csrf_token = Invidious::Helpers::Tokens.generate_response(sid, {":edit_playlist"}, HMAC_KEY)

    templated "edit_playlist"
  end

  def self.update(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    sid = env.get? "sid"
    referer = get_referer(env)

    return env.redirect "/" if user.nil?

    plid = env.params.query["list"]?
    return env.redirect referer if plid.nil?

    user = user.as(User)
    sid = sid.as(String)
    token = env.params.body["csrf_token"]?

    playlist = Invidious::Database::Playlists.select(id: plid)
    if !plid.starts_with?("IV") || !playlist || playlist.author != user.email
      return Errors.error_template(403, "Only owned playlists can be edited")
    end
    begin
      Invidious::Helpers::Tokens.validate_request(token, sid, env.request, HMAC_KEY, locale)
    rescue
      return form_failure(env, "Invalid CSRF token", playlist: playlist)
    end
    if invalid = Frontend::PlaylistForms.validate(env.params.body, edit: true)
      return form_failure(env, I18n.translate(locale, invalid[1]), invalid[0], playlist)
    end
    title = env.params.body["title"].strip
    privacy = PlaylistPrivacy.parse(env.params.body["privacy"])
    description = env.params.body["description"]?.try(&.delete('\r')) || ""
    updated = title != playlist.title || privacy != playlist.privacy || description != playlist.description ? Time.utc : playlist.updated
    begin
      Invidious::Database::Playlists.update(plid, title, privacy, description, updated)
    rescue
      return form_failure(env, I18n.translate(locale, "overhaul_edit_uncertain"), playlist: playlist, status: 503)
    end
    if env.params.query["redirect"]? == "false"
      env.response.content_type = "application/json"
      return {"playlistId" => plid, "title" => title, "privacy" => privacy.to_s, "description" => description}.to_json
    end

    env.redirect "/playlist?list=#{plid}"
  end

  def self.add_playlist_items_page(env)
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale

    params = env.request.method == "POST" ? env.params.body : env.params.query
    region = params["region"]? || preferences.region
    user = env.get?("user").try &.as(User)
    referer = get_referer(env)
    return env.redirect "/" unless user
    plid = params["list"]?
    return env.redirect referer unless plid && plid.starts_with?("IV")
    playlist = Invidious::Database::Playlists.select(id: plid)
    return Errors.error_template(403, "Only owned playlists can be edited") unless playlist && playlist.author == user.email
    env.response.headers["Cache-Control"] = "private, no-store"
    show_members = Frontend::SearchPreferences.apply(env, params, preferences.show_member_videos, !!(Kemal.config.ssl || CONFIG.https_only))
    env.set "show_member_videos", show_members
    query = Invidious::Search::Query.new(params, :playlist, region)
    source_count = 0
    begin
      items = query.empty? ? [] of SearchVideo : query.process.select(SearchVideo).map(&.as(SearchVideo))
      source_count = items.size
      # A library search keeps its results; existing AI rules replace thumbnails.
      items = Frontend::MemberVideos.filter(items, show_members)
    rescue
      items = [] of SearchVideo
      env.set "playlist_search_error", true
    end
    page = query.page
    next_params = query.to_http_params
    next_params["list"] = plid
    page_nav_html = Frontend::Pagination.nav_numeric(locale,
      base_url: "/add_playlist_items?#{next_params}", current_page: page,
      show_next: source_count >= 20, post: Frontend::Desktop.private_search?(env))
    env.set "add_playlist_items", plid

    templated "add_playlist_items"
  end

  def self.playlist_ajax(env)
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

    begin
      playlist_id = env.params.query["playlist_id"]
      playlist = Invidious::Playlists::Playlists.get_playlist(playlist_id).as(InvidiousPlaylist)
      raise "Invalid user" if playlist.author != user.email
    rescue ex : NotFoundException
      return Errors.error_json(404, ex)
    rescue ex
      if redirect
        return Errors.error_template(400, ex)
      else
        return Errors.error_json(400, ex)
      end
    end

    snapshot = env.params.body["include_positions"]? == "1" ? [] of Int64 : nil
    case action = env.params.query["action"]?
    when "add_video"
      if playlist.index.size >= CONFIG.playlist_length_limit
        if redirect
          return Errors.error_template(400, "Playlist cannot have more than #{CONFIG.playlist_length_limit} videos")
        else
          return Errors.error_json(400, "Playlist cannot have more than #{CONFIG.playlist_length_limit} videos")
        end
      end

      video_id = env.params.query["video_id"]

      begin
        video = get_video(video_id)
      rescue ex : NotFoundException
        return Errors.error_json(404, ex)
      rescue ex
        if redirect
          return Errors.error_template(500, ex)
        else
          return Errors.error_json(500, ex)
        end
      end

      playlist_video = PlaylistVideo.new({
        title:          video.title,
        id:             video.id,
        author:         video.author,
        ucid:           video.ucid,
        length_seconds: video.length_seconds,
        published:      video.published,
        plid:           playlist_id,
        live_now:       video.live_now,
        members_only:   video.members_only,
        index:          Random::Secure.rand(0_i64..Int64::MAX),
      })

      outcome, _ = Invidious::Database::Playlists.append_video(playlist_id, user.email, playlist_video, snapshot)
      return Errors.error_json(404, "Playlist not found") if outcome == :missing
      return Errors.error_json(403, "Invalid user") if outcome == :forbidden
      return Errors.error_json(400, "Playlist cannot have more than #{CONFIG.playlist_length_limit} videos") if outcome == :full
    when "remove_video"
      index = env.params.query["set_video_id"].to_i64?
      if index.nil? || !playlist.index.includes? index
        return Errors.error_json(404, "Playlist does not contain index")
      end

      case Invidious::Database::Playlists.remove_video(playlist_id, user.email, index, snapshot)
      when :missing   then return Errors.error_json(404, "Playlist not found")
      when :forbidden then return Errors.error_json(403, "Invalid user")
      when :conflict  then return Errors.error_json(409, "Playlist entries changed; refresh the playlist")
      end
    when "move_video_before"
      source = env.params.body["source"]?.try(&.to_i64?)
      anchor = env.params.body["anchor"]?.try(&.to_i64?)
      placement = env.params.body["placement"]? || "before"
      unless source && anchor && {"before", "after"}.includes?(placement)
        return Errors.error_json(400, "Invalid playlist entry or placement")
      end
      case Invidious::Database::Playlists.move_video(playlist_id, user.email, source, anchor, placement == "after", snapshot)
      when :missing   then return Errors.error_json(404, "Playlist not found")
      when :forbidden then return Errors.error_json(403, "Invalid user")
      when :conflict  then return Errors.error_json(409, "Playlist entries changed; refresh the playlist")
      end
    when nil
      return Errors.error_json(400, "Missing action")
    else
      return Errors.error_json(400, "Unsupported action #{action}")
    end

    if snapshot && !redirect
      env.response.content_type = "application/json"
      return {"positions" => snapshot.map_with_index { |id, index| {id.to_s, index + 1} }.to_h,
              "total" => snapshot.size, "countText" => I18n.translate_count(locale, "generic_videos_count", snapshot.size)}.to_json
    end

    if redirect
      env.redirect referer
    else
      env.response.content_type = "application/json"
      "{}"
    end
  end

  def self.show(env)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get?("user").try &.as(User)
    referer = get_referer(env)

    plid = env.params.query["list"]?.try &.gsub(/[^a-zA-Z0-9_-]/, "")
    plid ||= env.params.url["id"]?.try &.[2..]
    if !plid
      return env.redirect "/"
    end

    page = env.params.query["page"]?.try &.to_i?
    page ||= 1

    if plid.starts_with? "RD"
      return env.redirect "/mix?list=#{plid}"
    end

    begin
      playlist = Invidious::Playlists::Playlists.get_playlist(plid)
    rescue ex : NotFoundException
      return Errors.error_template(404, ex)
    rescue ex
      return Errors.error_template(500, ex)
    end

    if playlist.privacy == PlaylistPrivacy::Private && playlist.author != user.try &.email
      return Errors.error_template(403, "This playlist is private.")
    end

    if playlist.is_a? InvidiousPlaylist
      page_count = (playlist.video_count / 100).to_i
      page_count += 1 if (playlist.video_count % 100) > 0
    else
      page_count = (playlist.video_count / 200).to_i
      page_count += 1 if (playlist.video_count % 200) > 0
    end

    page_count = Math.max(1, page_count)
    page = Math.max(1, page)
    if page > page_count
      return env.redirect "/playlist?list=#{plid}&page=#{page_count}"
    end

    begin
      if playlist.is_a? InvidiousPlaylist
        items = Invidious::Playlists::Playlists.get_playlist_videos(playlist, offset: (page - 1) * 100)
      else
        items = Invidious::Playlists::Playlists.get_playlist_videos(playlist, offset: (page - 1) * 200)
      end
    rescue ex
      return Errors.error_template(500, ex)
    end

    if playlist.is_a?(InvidiousPlaylist) && playlist.author == user.try &.email
      env.set "remove_playlist_items", plid
      env.set "playlist_order_total", playlist.video_count.to_s
    end

    # Pagination
    page_nav_html = Frontend::Pagination.nav_numeric(locale,
      base_url: "/playlist?list=#{playlist.id}",
      current_page: page,
      show_next: (page_count != 1 && page < page_count)
    )

    env.set "playlist_saved", Database::SavedPlaylists.exists?(user.email, plid) if user
    templated "playlist"
  end

  def self.mix(env)
    locale = env.get("preferences").as(Preferences).locale

    rdid = env.params.query["list"]?
    if !rdid
      return env.redirect "/"
    end

    continuation = env.params.query["continuation"]?
    continuation ||= rdid.lchop("RD")
    begin
      return Errors.error_template(400, "Invalid mix ID") unless NativePlaylists.valid_id?(rdid)
      continuation = NativePlaylists.seed(rdid, continuation)
    rescue ex : InfoException
      return Errors.error_template(400, ex)
    end

    begin
      mix = fetch_mix(rdid, continuation, locale: locale)
    rescue ex
      return Errors.error_template(500, ex)
    end

    if mix_user = env.get?("user").try(&.as(User))
      env.set "playlist_saved", Database::SavedPlaylists.exists?(mix_user.email, rdid)
    end
    templated "mix"
  end

  # Undocumented, creates anonymous playlist with specified 'video_ids', max 50 videos
  def self.watch_videos(env)
    response = YT_POOL.client &.get(env.request.resource)
    if url = response.headers["Location"]?
      url = URI.parse(url).request_target
      return env.redirect url
    end

    env.response.status_code = response.status_code
  end
end

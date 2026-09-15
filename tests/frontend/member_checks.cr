# Production preference and persistence checks, running inside the fixture harness.
def check_member_preferences
  raise "Members shown by default" if Preferences.from_json("{}").show_member_videos
  raise "Legacy YAML default changed" if Preferences.from_yaml("{}").show_member_videos
  raise "Instance default changed" if ConfigPreferences.from_yaml("{}").show_member_videos
  original = CONFIG.default_user_preferences.show_member_videos
  begin
    CONFIG.default_user_preferences.show_member_videos = true
    raise "Instance default ignored" unless Preferences.from_json("{}").show_member_videos
  ensure
    CONFIG.default_user_preferences.show_member_videos = original
  end

  {true, false}.each do |show|
    prefs = Preferences.from_json({show_member_videos: show}.to_json)
    raise "JSON preference lost" unless Preferences.from_json(prefs.to_json).show_member_videos == show
    raise "YAML preference lost" unless Preferences.from_yaml(prefs.to_yaml).show_member_videos == show
    env = theme_post_env(show ? "show_member_videos=on" : "")
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    raise "Anonymous member preference lost" unless saved.show_member_videos == show

    user = signed_in_env("/preferences").get("user").as(User)
    env = theme_post_env(show ? "show_member_videos=on" : "")
    env.set "user", user
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Account member preference lost" unless saved.show_member_videos == show

    env = theme_post_env(prefs.to_json, "application/json")
    env.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(env)
    saved = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "API member preference lost" unless saved.show_member_videos == show
    user.preferences = saved
    exported = JSON.parse(Invidious::User::Export.to_invidious(user))
    raise "Export lost preference" unless exported["preferences"]["show_member_videos"].as_bool == show
    raise "Search setting in account export" if exported["preferences"]["include_blocked"]? || exported["preferences"]["SEARCH_SHOW_MEMBER_VIDEOS"]?
    Invidious::User::Import.from_invidious(user, {preferences: exported["preferences"]}.to_json)
    saved = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Import lost member preference" unless saved.show_member_videos == show
  end

  env = fixture_env("/search")
  prefs = env.get("preferences").as(Preferences)
  prefs.show_member_videos = true
  env.set "preferences", prefs
  env.set "show_member_videos", false
  raise "False search override ignored" if Invidious::Frontend::MemberVideos.show?(env)

  # The normal video cache stores the membership marker with related-video data.
  video = fixture_video
  video.info["membersOnly"] = JSON::Any.new(true)
  video.info["relatedVideos"] = JSON.parse(%([{"id":"members0001","members_only":"true"},{"id":"public00001"}]))
  restored = Video.new({id: video.id, info: JSON.parse(video.info.to_json).as_h, updated: video.updated})
  raise "Cached membership lost" unless restored.members_only
  raise "Cached recommendation lost" unless Invidious::Frontend::MemberVideos.recommendations(restored.related_videos, false).map(&.["id"]) == ["public00001"]

  # DB mapping must tolerate old rows and persist the new field in tuple order.
  PG_DB.exec("CREATE TABLE playlist_videos (title TEXT, id TEXT, author TEXT, ucid TEXT, length_seconds INTEGER, published TEXT, plid TEXT, \"index\" INTEGER, live_now INTEGER, members_only INTEGER NOT NULL DEFAULT 0)")
  item = PlaylistVideo.new({title: "Member video", id: "members0001", author: "Studio North", ucid: "UCfixture", length_seconds: 60, published: Time.utc, plid: "IVfixture", index: 7_i64, live_now: false, members_only: true})
  Invidious::Database::PlaylistVideos.insert(item)
  stored = PG_DB.query_one("SELECT * FROM playlist_videos", as: PlaylistVideo)
  raise "Stored membership lost" unless stored.members_only && stored.index == 7
  legacy = PG_DB.query_one("SELECT title, id, author, ucid, length_seconds, published, plid, \"index\", live_now FROM playlist_videos", as: PlaylistVideo)
  raise "Legacy row default wrong" if legacy.members_only
  raise "API discarded membership" unless JSON.parse(stored.to_json(nil))["isMember"].as_bool
end

def member_search_fixture(show : Bool, empty = false)
  env = signed_in_env("/search?q=light")
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  query = Invidious::Search::Query.new(HTTP::Params.parse("q=light&page=2&show_member_videos=#{show ? 1 : 0}&include_blocked=1"))
  env.set "show_member_videos", show
  items = [SearchVideo.new({title: "Member video", id: "members0001", author: "Studio North", ucid: "UCfixture", published: Time.utc, views: 100_i64, description_html: "", length_seconds: 60, premiere_timestamp: nil, author_verified: false, author_thumbnail: nil, badges: VideoBadges::MembersOnly})]
  unless empty
    public_video = items.first
    public_video.id = "public00001"
    public_video.title = "Public video"
    public_video.badges = VideoBadges::Premium
    items << public_video
  end
  blocked_results = false
  before = items.size
  items = Invidious::Frontend::MemberVideos.filter(items, show)
  member_results = items.size < before
  redirect_url = "/"
  page_nav_html = Invidious::Frontend::Pagination.nav_numeric(locale, base_url: "/search?#{query.to_http_params}", current_page: 2, show_next: true)
  navbar_search = true
  render "src/invidious/views/search.ecr", "src/invidious/views/template.ecr"
end

def check_member_extraction
  regular = JSON.parse(%({"videoRenderer":{"videoId":"members0001","title":{"simpleText":"Member video"},"badges":[{"metadataBadgeRenderer":{"style":"BADGE_STYLE_TYPE_MEMBERS_ONLY","label":"Members only"}}]}}))
  extracted = parse_item(regular).as(SearchVideo)
  raise "Renderer discarded membership" unless extracted.members_only
  raise "Membership confused with Premium" if extracted.badges.premium?
  regular["videoRenderer"].as_h["badges"] = JSON.parse(%([{"metadataBadgeRenderer":{"label":"Premium"}}]))
  premium = parse_item(regular).as(SearchVideo)
  raise "Premium incorrectly hidden" if premium.members_only || !premium.badges.premium?

  lockup = JSON.parse(%({"lockupViewModel":{"contentType":"LOCKUP_CONTENT_TYPE_VIDEO","contentId":"members0001","contentImage":{"thumbnailViewModel":{"image":{"sources":[{"url":"https://i.ytimg.com/vi/members0001/hqdefault.jpg"}]},"overlays":[{"thumbnailBottomOverlayViewModel":{"badges":[{"thumbnailBadgeViewModel":{"text":"Members only"}},{"thumbnailBadgeViewModel":{"text":"12:34"}}]}}]}},"metadata":{"lockupMetadataViewModel":{"title":{"content":"Member video"},"metadata":{"contentMetadataViewModel":{"metadataRows":[{"metadataParts":[{"text":{"content":"100 views"}}]}]}}}},"rendererContext":{"commandContext":{"onTap":{"innertubeCommand":{"watchEndpoint":{"videoId":"members0001","playlistId":"PLfixture","index":4}}}}}}}))
  modern = parse_item(lockup, "Studio North", "UCfixture").as(SearchVideo)
  raise "Lockup discarded membership or duration" unless modern.members_only && modern.length_seconds == 754
  upstream = {"onResponseReceivedActions" => JSON.parse({appendContinuationItemsAction: {continuationItems: [lockup]}}.to_json)}
  upstream["onResponseReceivedActions"] = JSON::Any.new([upstream["onResponseReceivedActions"]])
  entry = extract_playlist_videos("PLfixture", upstream).first.as(PlaylistVideo)
  raise "Playlist discarded membership or index" unless entry.members_only && entry.index == 4 && entry.length_seconds == 754

  related = JSON.parse(%({"videoId":"members0001","title":{"simpleText":"Member video"},"badges":[{"metadataBadgeRenderer":{"label":"Members only"}}]}))
  parsed = Invidious::Videos::Parser.parse_related_video(related).not_nil!
  raise "Recommendation discarded membership" unless parsed["members_only"].as_s == "true"

  # Cached channel rows keep membership through DB serialization in column order.
  PG_DB.exec("CREATE TABLE channel_videos (id TEXT, title TEXT, published TEXT, updated TEXT, ucid TEXT, author TEXT, length_seconds INTEGER, live_now INTEGER, premiere_timestamp TEXT, views INTEGER, members_only INTEGER NOT NULL DEFAULT 0)")
  channel_video = ChannelVideo.new({id: modern.id, title: modern.title, published: modern.published, updated: Time.utc, ucid: modern.ucid, author: modern.author, length_seconds: modern.length_seconds, live_now: false, premiere_timestamp: nil, views: modern.views, members_only: modern.members_only})
  PG_DB.exec("INSERT INTO channel_videos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", *channel_video.to_tuple)
  restored = PG_DB.query_one("SELECT * FROM channel_videos", as: ChannelVideo)
  raise "Channel DB membership lost" unless restored.members_only
  raise "Subscription card not hidden" if Invidious::Frontend::MemberVideos.visible?(restored, false)

  env = fixture_env("/search?q=light&show_member_videos=1&reset_member_videos=1")
  env.request.headers["Cookie"] = "SEARCH_SHOW_MEMBER_VIDEOS=1"
  Invidious::Routes::Search.search(env)
  location = env.response.headers["Location"]
  raise "Reset did not redirect to clean search" unless location == "/search?q=light"
  raise "Reset did not expire browser override" unless env.response.cookies[Invidious::Frontend::SearchPreferences::MEMBER_COOKIE].expires == Time.unix(0)
end

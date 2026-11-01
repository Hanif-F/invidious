# Render production templates with deterministic data, without starting Invidious,
# contacting YouTube, or requiring PostgreSQL. Playback is stubbed by the browser tests.
require "digest/md5"
require "file_utils"

# Require kemal, then our own overrides
require "kemal"
require "../../src/ext/kemal_static_file_handler.cr"

require "http_proxy"
require "athena-negotiation"
require "openssl/hmac"
require "option_parser"
require "sqlite3"
require "xml"
require "yaml"
require "compress/zip"
require "protodec/utils"

require "../../src/invidious/database/*"
require "../../src/invidious/database/migrations/*"
require "../../src/invidious/http_server/*"
require "../../src/invidious/helpers/*"
require "../../src/invidious/yt_backend/*"
require "../../src/invidious/frontend/*"
require "../../src/invidious/videos/*"

require "../../src/invidious/jsonify/**"

require "../../src/invidious/*"
require "../../src/invidious/comments/*"
require "../../src/invidious/channels/*"
require "../../src/invidious/user/*"
require "../../src/invidious/search/*"
require "../../src/invidious/routes/**"
require "../../src/invidious/jobs/base_job"
require "../../src/invidious/jobs/*"

# Declare the base namespace for invidious
module Invidious
end

# Simple alias to make code easier to read
alias IV = Invidious

include Invidious

add_context_storage_type(Array(String))
add_context_storage_type(Preferences)
add_context_storage_type(Invidious::User)

NOTIFICATION_CHANNEL = ::Channel(VideoNotification).new(32)
CONFIG               = Config.from_yaml("hmac_key: frontend-fixtures\n")
HMAC_KEY             = "frontend-fixtures"
PG_DB                = DB.open("sqlite3::memory:")
HOST_URL             = "https://invidious.test"
MAX_ITEMS_PER_PAGE   = 1500
CURRENT_BRANCH       = "fixture"
CURRENT_COMMIT       = "fixture"
CURRENT_VERSION      = "fixture"
CURRENT_TAG          = ""
ASSET_COMMIT         = "fixture"
SOFTWARE             = {"version" => "fixture", "branch" => "fixture"}
OUTPUT               = File.open(File::NULL, "w")
LOGGER               = Invidious::LogHandler.new(OUTPUT, LogLevel::Off)
YT_POOL              = YoutubeConnectionPool.new(URI.parse("https://www.youtube.com"), capacity: 1)
GGPHT_POOL           = YoutubeConnectionPool.new(URI.parse("https://yt3.ggpht.com"), capacity: 1)
COMPANION_POOL       = CompanionConnectionPool.new(capacity: 1)

FIXTURE_ORIGINAL_TITLES = Invidious::OriginalTitles::Client.new(->(_id : String) { Invidious::OriginalTitles::Result.new(nil, 10.minutes) })
require "./runtime_owner_fixtures"

def fixture_env(path, mode = "dark", thin = false, density = "balanced", locale = "en-US", method = "GET")
  preferences = Preferences.from_json({"dark_mode" => mode, "thin_mode" => thin, "ui_density" => density, "locale" => locale, "comments" => ["", ""], "preload" => false}.to_json)
  env = HTTP::Server::Context.new(HTTP::Request.new(method, path), HTTP::Server::Response.new(IO::Memory.new))
  env.set "preferences", preferences
  env.set "original_title_selection", Invidious::OriginalTitles::Selection.new(preferences.show_original_title, FIXTURE_ORIGINAL_TITLES)
  env.set "current_page", path
  env
end

def fixture_video(video_id = "2isYuQZMbdU")
  raw = JSON.parse(File.read("mocks/video/regular_mrbeast.player.json")).as_h
  raw.merge!(JSON.parse(File.read("mocks/video/regular_mrbeast.next.json")).as_h)
  info = Invidious::Videos::Parser.parse_video_info(video_id, raw)
  info["title"] = JSON::Any.new("A journey through light, color, and motion")
  info["author"] = JSON::Any.new("Studio North")
  info["descriptionHtml"] = JSON::Any.new("A closer look at the small details that make a world.\n0:00 Introduction\n1:20 Finding the light\n3:45 Color in motion")
  info["description"] = info["descriptionHtml"]
  info["shortDescription"] = info["descriptionHtml"]
  info["captions"] = JSON.parse(%({"playerCaptionsTracklistRenderer":{"captionTracks":[{"name":{"simpleText":"English"},"languageCode":"en","baseUrl":"https://example.com/en"},{"name":{"simpleText":"Indonesian (auto-generated)"},"languageCode":"id","kind":"asr","baseUrl":"https://example.com/id"}]}}))
  Video.new({id: video_id, info: info, updated: Time.utc})
end

# The public watch serializer must expose the same license and rich information as the web page.
metadata_video = fixture_video
metadata_video.info["storyboards"] = JSON.parse("{}")
metadata = JSON.parse(metadata_video.to_json("en-US", nil))
raise "Missing standard video license" unless metadata["license"].as_s.empty?
raise "Missing rich video metadata" unless metadata["descriptionHtml"].as_s.includes?("0:00") && metadata["authorVerified"].as_bool && metadata["allowedRegions"].as_a.size > 0
metadata_video.license = "Creative Commons Attribution license"
metadata_video.info["music"] = JSON.parse(%([{"song":"Fixture song","artist":"Fixture artist","album":"Fixture album","license":"Fixture music license"}]))
metadata = JSON.parse(metadata_video.to_json("en-US", nil))
raise "Custom video license lost" unless metadata["license"].as_s == "Creative Commons Attribution license"
raise "Music credit lost" unless metadata["musicTracks"][0]["song"].as_s == "Fixture song" && metadata["musicTracks"][0]["license"].as_s == "Fixture music license"

def watch_fixture(env, plid : String? = "PLfixture", embed = false, account = false, chapter_description : String? = nil, chat = false, chat_only = false, native_clip : InvidiousClip? = nil, clip_duration : Int32? = nil, supplied_video : Video? = nil, quality : String = "medium", aspect : String = "16:9", fallback_formats : Array(Hash(String, JSON::Any))? = nil, nojs_comments : Bool = false, initial_comment_html : String = "", sync_positions : Bool = false)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  video = supplied_video || fixture_video
  video.length_seconds = clip_duration if clip_duration
  video.info["liveChatReplay"] = JSON::Any.new(true) if chat
  video.info["shortDescription"] = JSON::Any.new(chapter_description) if chapter_description
  related_videos = video.related_videos
  id = video.id
  continuation = 2
  preview_clip = false
  params = Invidious::Videos.process_video_params(URI::Params.new, preferences)
  params.related_videos = false if chat_only
  params.comments = preferences.comments
  params.quality = quality
  if native_clip
    plid = nil
    params.video_start = native_clip.start_time
    params.video_end = native_clip.end_time
    params.video_loop = true
    params.save_player_pos = false
    params.continue = false
    env.set "native_clip_title", native_clip.title
    env.set "native_clip_id", native_clip.id
  end
  params.vr_mode = false
  playback_sync = sync_positions && native_clip.nil?
  playback_position = nil
  chat_timing_ms = 0
  user = account ? env.get?("user").try(&.as(User)) : nil
  subscriptions = [] of String
  nojs = nojs_comments
  comment_html = initial_comment_html
  thumbnail = "/vi/#{id}/maxres.jpg"
  aspect_ratio = aspect
  invidious_companion = nil.as(Config::CompanionConfig?)
  video_streams = video.video_streams
  audio_streams = video.audio_streams
  fmt_stream = fallback_formats || [JSON.parse(%({"mimeType":"video/webm","itag":43,"quality":"medium","url":"/fixture.webm"})).as_h]
  adaptive_fmts = video.adaptive_fmts
  captions = video.captions
  preferred_captions = [] of Invidious::Videos::Captions::Metadata
  video_assets = Invidious::Frontend::WatchPage::VideoAssets.new(fmt_stream, video_streams, audio_streams, captions)
  navbar_search = true
  if embed
    video_series = nil.as(String?)
    render "src/invidious/views/embed.ecr"
  else
    render "src/invidious/views/watch.ecr", "src/invidious/views/template.ecr"
  end
end

def browse_fixture(env, valid_ids = false)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  items = (0...12).map do |i|
    SearchVideo.new({title: ["The art of noticing", "An ordinary day, beautifully observed", "Finding color in unexpected places"][i % 3], id: (preferences.dearrow_enabled || valid_ids) ? i.to_s.rjust(11, '0') : "fixture#{i}", author: "Studio North", ucid: "UCfixture", published: Time.utc - 3.days, views: 123456_i64, description_html: "A new perspective.", length_seconds: 720, premiere_timestamp: nil, author_verified: true, author_thumbnail: nil, badges: VideoBadges::None})
  end
  navbar_search = true
  current_page = env.params.query["page"]?.try(&.to_i?) || 1
  page_nav_html = Invidious::Frontend::Pagination.nav_numeric(locale, base_url: env.request.resource, current_page: current_page, show_next: current_page < 3)
  if env.get?("ui_overhaul_preview")
    render "src/invidious/views/overhaul/browse.ecr", "src/invidious/views/overhaul/shell.ecr"
  else
    render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
  end
end

def preferences_fixture(env)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  referer = "/"
  navbar_search = true
  render "src/invidious/views/user/preferences.ecr", "src/invidious/views/template.ecr"
end

def playlist_library_fixture(mode = "light", add_video = false, empty = false)
  env = signed_in_env("/feed/playlists")
  preferences = env.get("preferences").as(Preferences)
  preferences.dark_mode = mode
  env.set "preferences", preferences
  locale = preferences.locale
  items_created = (0...(empty ? 0 : 4)).map do |i|
    InvidiousPlaylist.new({title: ["Light and motion", "私のコレクション — ألوان وحركة", "A longer title with <markup> & useful notes", "An empty playlist"][i], id: "IVfixture#{i}", author: "viewer@example.test", video_count: i == 3 ? 0 : 12,
                           description: "", created: Time.utc, updated: Time.utc, privacy: PlaylistPrivacy.values[i % 3], index: [] of Int64})
  end
  playlist_covers = items_created.to_h { |item| {item.id, item.video_count == 0 ? "" : "2isYuQZMbdU"} }
  items_saved = empty ? [] of JSON::Any : [
    JSON.parse({playlistId: "PLremote", title: "Field notes <saved>", author: "Studio North", videoCount: 23, privacy: "unlisted", playlistThumbnail: "/vi/2isYuQZMbdU/mqdefault.jpg", isMix: false}.to_json),
    JSON.parse({playlistId: "RDMixRadio", title: "A saved mix", author: "", videoCount: -1, privacy: "public", playlistThumbnail: "/vi/previous001/mqdefault.jpg", isMix: true, seedVideoId: "previous001"}.to_json),
    JSON.parse({playlistId: "IVshared", title: "Another person's playlist", author: "Another person", videoCount: 0, privacy: "public", playlistThumbnail: ""}.to_json),
  ]
  add_video_id = add_video ? "2isYuQZMbdU" : nil
  navbar_search = true
  render "src/invidious/views/feeds/playlists.ecr", "src/invidious/views/template.ecr"
end

def queue_fixture(thin = false)
  playlist = JSON.parse({playlistId: "PLfixture", title: "Light & motion <study>", videoCount: 4, videos: [
    {videoId: "2isYuQZMbdU", index: 0, title: "Introduction", author: "Studio North", lengthSeconds: 240},
    {videoId: "previous001", index: 1, title: "Finding the light", author: "Studio North", lengthSeconds: 360},
    {videoId: "2isYuQZMbdU", index: 2, title: "A journey through light, color, and motion", author: "Studio North", lengthSeconds: 930},
    {videoId: "nextvideo01", index: 3, title: "The next chapter", author: "Studio North", lengthSeconds: 420},
  ]}.to_json)
  {playlistHtml: template_playlist(playlist, false, thin), nextVideo: "nextvideo01", index: 3}.to_json
end

def signed_in_env(path)
  env = fixture_env(path)
  user = Invidious::User.new({updated: Time.utc, notifications: [] of String, subscriptions: [] of String, email: "viewer@example.test", username: "viewer@example.test", credential_version: 1, preferences: env.get("preferences").as(Preferences), password: nil, token: "fixture", watched: [] of String, feed_needs_update: false})
  env.set "user", user
  env.set "csrf_token", "fixture-token"
  env.set "sid", "fixture-session"
  env.set "blocked_channels", [] of String
  env
end

def navigation_fixture
  env = signed_in_env("/feed/subscriptions")
  preferences = env.get("preferences").as(Preferences)
  preferences.feed_menu = ["Popular", "Trending"]
  locale = preferences.locale
  render "src/invidious/views/components/navigation.ecr"
end

def history_fixture(empty = false, thin = false, history_query = "", sync = false, dearrow = false, ai = false, known_views = false)
  env = signed_in_env("/feed/history")
  preferences = env.get("preferences").as(Preferences)
  preferences.thin_mode = thin
  env.set "preferences", preferences
  user = env.get("user").as(User)
  user.watched = ["2isYuQZMbdU", "previous001", "nextvideo01"]
  preferences.save_player_pos = sync
  preferences.dearrow_enabled = dearrow
  user.preferences = preferences
  env.set "preferences", preferences
  env.set "user", user
  ai_other_preferences(env) if ai
  history_today = "2026-09-13"
  watched = [
    Invidious::Database::WatchHistory::Entry.new("2isYuQZMbdU", "A journey through light, color, and motion", "Studio North", "UCfixture", "2026-08-01", "2026-09-13", length_seconds: 1000),
    Invidious::Database::WatchHistory::Entry.new("previous001", "Light <study> & color", "A channel", nil, nil, "2026-09-12", length_seconds: 1000),
    Invidious::Database::WatchHistory::Entry.new("nextvideo01"),
  ]
  if ai
    first_entry = watched[0]
    first_entry.channel_id = ai_fixture_video('a', "@blocked").ucid
    watched[0] = first_entry
  end
  watched.select! { |entry| Invidious::History.matches?(entry.title, entry.channel_name, history_query) }
  watched.clear if empty
  user.watched.clear if empty
  history_count = watched.size
  if known_views
    env.set "view_counts", {"2isYuQZMbdU" => Invidious::Videos::ViewCounts::Count.new(1234_i64, "exact"), "previous001" => Invidious::Videos::ViewCounts::Count.new(0_i64, "exact")} of String => Invidious::Videos::ViewCounts::Count?
  end
  history_clear_url = "/feed/history"
  locale = user.preferences.locale
  page = 1
  max_results = 20
  base_url = "/feed/history"
  navbar_search = true
  render "src/invidious/views/feeds/history.ecr", "src/invidious/views/template.ecr"
end

def diary_channel_fixture(mode = "light", playlists = false, search = false, privacy = false, empty = false, ai = false, secondary = "", literal = false, signed = false)
  fixture_channel_id = signed ? "UC" + "a" * 22 : "UCfixture"
  env = signed ? signed_in_env("/channel/#{fixture_channel_id}") : fixture_env(search ? "/channel/UCfixture/search" : "/channel/UCfixture", mode)
  prefs = env.get("preferences").as(Preferences); prefs.dark_mode = mode; env.set "preferences", prefs
  locale = "en-US"
  user = env.get?("user").try &.as(User)
  subscriptions = user.try(&.subscriptions) || [] of String
  channel = AboutChannel.new(ucid: fixture_channel_id, author: "Studio North", auto_generated: false,
    author_url: "/channel/UCfixture", author_thumbnail: "https://example.test/avatar", banner: "https://example.test/banner",
    description: "Collecting the small details of everyday life.", description_html: "Collecting the small details of everyday life.",
    total_views: 123456_i64, sub_count: 1200, joined: Time.utc, is_family_friendly: true, pronouns: nil,
    allowed_regions: [] of String, tabs: ["videos", "shorts", "playlists"], tags: [] of String, verified: true, is_age_gated: false)
  selected_tab = playlists ? Invidious::Frontend::ChannelPage::TabsAvailable::Playlists : Invidious::Frontend::ChannelPage::TabsAvailable::Videos
  continuation = next_continuation = nil
  sort_options = ["newest", "oldest", "popular"]
  sort_by = "newest"
  items = [SearchVideo.new({title: "The art of noticing", id: "fixture0", author: "Studio North", ucid: "UCfixture", published: Time.utc, views: 123456_i64, description_html: "A new perspective.", length_seconds: 720, premiere_timestamp: nil, author_verified: true, author_thumbnail: nil, badges: VideoBadges::None})]
  if ai
    ai_other_preferences(env)
    items = [ai_fixture_video('a', "@blocked"), ai_fixture_video('b', "@moderate"), ai_fixture_video('c', "@safe")]
  end
  if playlists
    items = (0...4).map do |i|
      SearchPlaylist.new({title: "Light and motion #{i + 1}", id: "PLfixture#{i}", author: "Studio North", ucid: "UCfixture", video_count: 12, videos: [] of SearchPlaylistVideo, thumbnail: "/vi/2isYuQZMbdU/mqdefault.jpg", author_verified: false})
    end
  end
  unless secondary.empty?
    selected_tab = Invidious::Frontend::ChannelPage::TabsAvailable.parse(secondary)
    channel.tabs << secondary.downcase
    sort_options = [] of String
  end
  navbar_search = true
  if search
    preferences = env.get("preferences").as(Preferences)
    preferences.search_privacy = privacy
    env.set "preferences", preferences
    query = Invidious::Search::Query.new(HTTP::Params{"q" => (literal ? "\\https://youtu.be/aaaaaaaaaaa" : %(<cats> & "dogs" + café)), "page" => "2"}, :channel)
    query.channel = channel.ucid
    env.set "channel_search_query", query.input
    selected_tab = Invidious::Frontend::ChannelPage::TabsAvailable::Search
    sort_options = [] of String
    items = [] of SearchVideo if empty
    upstream_count = empty ? 0 : 30
    render "src/invidious/views/channel_search.ecr", "src/invidious/views/template.ecr"
  else
    render "src/invidious/views/channel.ecr", "src/invidious/views/template.ecr"
  end
end

def diary_login_fixture(mode = "light", signup = false)
  env = fixture_env("/login", mode)
  locale = "en-US"
  username = ""
  error = captcha = nil
  csrf_token = "fixture-csrf"
  referer = "/"
  navbar_search = true
  render "src/invidious/views/user/login.ecr", "src/invidious/views/template.ecr"
end

def diary_error_fixture(mode = "light")
  env = fixture_env("/unavailable", mode)
  locale = "en-US"
  error_message = "<h1>This page is unavailable</h1><p>Please try again later.</p>"
  next_steps = "<a href=\"/\">Return home</a>"
  navbar_search = true
  render "src/invidious/views/error.ecr", "src/invidious/views/template.ecr"
end

def diary_playlist_fixture(mode = "light", editable = false)
  env = fixture_env("/playlist?list=PLfixture", mode)
  env.set "remove_playlist_items", "PLfixture" if editable
  locale = "en-US"
  items = (0...6).map do |i|
    PlaylistVideo.new({title: "A chapter in light and motion #{i + 1}", id: "fixture#{i}", author: "Studio North", ucid: "UCfixture", length_seconds: 720, published: Time.utc, plid: "PLfixture", index: i.to_i64, live_now: false, members_only: false})
  end
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

raise "Density default changed" unless Preferences.from_json("{}").ui_density == "balanced"
raise "Invalid density accepted" unless Preferences.from_json(%({"ui_density":"unknown"})).ui_density == "balanced"
raise "Density round trip failed" unless Preferences.from_json(Preferences.from_json(%({"ui_density":"compact"})).to_json).ui_density == "compact"
raise "Invalid YAML density accepted" unless Preferences.from_yaml("ui_density: unknown").ui_density == "balanced"

require "./appearance_checks"
require "./ai_slist_checks"

output = ENV["FRONTEND_FIXTURES"]? || "tests/frontend/.generated"
Dir.mkdir_p(output)
{"guest" => fixture_env("/watch?v=2isYuQZMbdU"), "account" => signed_in_env("/watch?v=2isYuQZMbdU")}.each do |kind, env|
  snapshot = Invidious::Frontend::EnhancementState.snapshot(env.get("preferences").as(Preferences), Invidious::BrowserProfiles.render_scope(env), !!env.get?("user"), ([] of String), HMAC_KEY, Time.unix(1_700_000_000))
  File.write("#{output}/enhancement-runtime-#{kind}.json", snapshot.to_json)
end
{"dark", "light", ""}.each do |mode|
  suffix = mode.empty? ? "auto" : mode
  File.write("#{output}/watch-#{suffix}.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2", mode)))
  File.write("#{output}/browse-#{suffix}.html", browse_fixture(fixture_env("/feed/popular", mode)))
end
File.write("#{output}/watch-single.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU"), nil))
File.write("#{output}/watch-chat.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU"), nil, chat: true))
File.write("#{output}/watch-chat-only.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU"), nil, chat: true, chat_only: true))
File.write("#{output}/watch-thin.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2", "dark", true)))
File.write("#{output}/browse-compact.html", browse_fixture(fixture_env("/feed/popular", "dark", false, "compact")))
File.write("#{output}/watch-rtl.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2", "dark", false, "balanced", "ar")))
File.write("#{output}/preferences.html", preferences_fixture(fixture_env("/preferences")))
File.write("#{output}/queue.json", queue_fixture)
File.write("#{output}/queue-thin.json", queue_fixture(true))
File.write("#{output}/browse-signed-in.html", browse_fixture(signed_in_env("/feed/popular")))
File.write("#{output}/navigation-subscribed.html", navigation_fixture)
File.write("#{output}/history.html", history_fixture)
File.write("#{output}/history-dearrow.html", history_fixture(dearrow: true))
File.write("#{output}/history-empty.html", history_fixture(empty: true))
File.write("#{output}/history-search.html", history_fixture(history_query: "STUDIO north"))
File.write("#{output}/history-no-matches.html", history_fixture(history_query: "<unmatched>"))
File.write("#{output}/history-thin.html", history_fixture(thin: true))
File.write("#{output}/playlist-library.html", playlist_library_fixture)
File.write("#{output}/preferences-diary.html", preferences_fixture(fixture_env("/preferences", "light")))
File.write("#{output}/browse-diary-compact.html", browse_fixture(fixture_env("/feed/popular", "light", false, "compact")))
File.write("#{output}/browse-diary-thin.html", browse_fixture(fixture_env("/feed/popular", "light", true)))
File.write("#{output}/watch-diary-rtl.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2", "light", false, "balanced", "ar")))
File.write("#{output}/search-diary.html", browse_fixture(fixture_env("/search?q=light", "light")))
File.write("#{output}/playlist-diary.html", diary_playlist_fixture)
File.write("#{output}/playlist-diary-editable.html", diary_playlist_fixture(editable: true))
File.write("#{output}/channel-diary.html", diary_channel_fixture)
File.write("#{output}/login-diary.html", diary_login_fixture)
File.write("#{output}/error-diary.html", diary_error_fixture)
check_appearance_preferences
check_color_modes
puts "Rendered frontend fixtures to #{output}"
check_ai_preferences(output)

# Account menus on recommendation cards without a PostgreSQL dependency.
File.write("#{output}/watch-actions.html", watch_fixture(signed_in_env("/watch?v=2isYuQZMbdU"), nil))
File.write("#{output}/watch-chat-account.html", watch_fixture(signed_in_env("/watch?v=2isYuQZMbdU"), nil, account: true, chat: true))

def search_blocked_fixture(include_blocked = false)
  env = signed_in_env("/search?q=light")
  preferences = env.get("preferences").as(Preferences)
  locale = "en-US"
  query = Invidious::Search::Query.new(HTTP::Params.parse("q=light&page=2&type=video&include_blocked=#{include_blocked ? 1 : 0}"))
  items = [] of SearchVideo
  blocked_results = !include_blocked
  member_results = false
  redirect_url = "/"
  page_nav_html = Invidious::Frontend::Pagination.nav_numeric(locale, base_url: "/search?#{query.to_http_params}", current_page: 2, show_next: true)
  navbar_search = true
  render "src/invidious/views/search.ecr", "src/invidious/views/template.ecr"
end

File.write("#{output}/search-blocked.html", search_blocked_fixture)
File.write("#{output}/search-included.html", search_blocked_fixture(true))

File.write("#{output}/watch-owned.html", watch_fixture(signed_in_env("/watch?v=2isYuQZMbdU&list=IVfixture&index=2"), "IVfixture"))

def editable_queue_fixture(removed = [] of Int32, cursor = 2, current_removed = false)
  ids = ["2isYuQZMbdU", "previous001", "2isYuQZMbdU", "nextvideo01"]
  videos = ids.each_with_index.reject { |_, original| removed.includes?(original) }.map_with_index do |(id, original), index|
    {videoId: id, index: index, indexId: (9007199254740993_i64 + original).to_s(16).upcase, title: "Occurrence #{original + 1}", author: "Studio North", lengthSeconds: 240}
  end
  playlist = JSON.parse({playlistId: "IVfixture", title: "Editable playlist", videoCount: videos.size, videos: videos}.to_json)
  next_index = cursor + (current_removed ? 0 : 1)
  {playlistHtml: template_playlist(playlist, false, false, true), currentIndex: cursor, nextVideo: videos[next_index]?.try(&.[:videoId]), index: videos[next_index]?.try(&.[:index])}.to_json
end

File.write("#{output}/queue-editable.json", editable_queue_fixture)
File.write("#{output}/queue-removed-before.json", editable_queue_fixture([0], 1))
File.write("#{output}/queue-removed-current.json", editable_queue_fixture([2], 2, true))
File.write("#{output}/queue-removed-next.json", editable_queue_fixture([3], 2))

require "./dearrow_checks"
check_dearrow_preferences
require "./sponsorblock_checks"
check_sponsorblock_preferences
check_sponsorblock_channels
write_sponsorblock_editor_fixtures(output)
{true, false}.each do |show_original|
  env = fixture_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2")
  prefs = env.get("preferences").as(Preferences)
  prefs.dearrow_enabled = true
  prefs.dearrow_show_original = show_original
  env.set "preferences", prefs
  suffix = show_original ? "dearrow" : "dearrow-no-original"
  File.write("#{output}/watch-#{suffix}.html", watch_fixture(env))
  File.write("#{output}/browse-#{suffix}.html", browse_fixture(env))
end

File.write("#{output}/embed-mobile.html", watch_fixture(fixture_env("/embed/2isYuQZMbdU"), nil, true))

check_dearrow_contributions(output)

require "./playlist_volume_checks"
check_playlist_volume
File.write("#{output}/channel-playlists-diary.html", diary_channel_fixture("dark", true))
File.write("#{output}/library-diary.html", playlist_library_fixture)

File.write("#{output}/channel-search.html", diary_channel_fixture(search: true))
File.write("#{output}/channel-search-private.html", diary_channel_fixture(search: true, privacy: true))
File.write("#{output}/channel-search-empty.html", diary_channel_fixture(search: true, empty: true))

File.write("#{output}/watch-chapters.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU"), chapter_description: "0:00 </script><script>alert(1)</script>\n0:02 日本語 & details"))

require "./member_checks"
check_member_preferences
require "./codec_checks"
check_codec_preferences
require "./seek_checks"
check_seek_preferences
require "./audio_checks"
check_audio_preferences
File.write("#{output}/search-members-hidden.html", member_search_fixture(false))
File.write("#{output}/search-members-shown.html", member_search_fixture(true))
File.write("#{output}/search-members-empty.html", member_search_fixture(false, true))
check_member_extraction

require "./progress_fixtures"
{false, true}.each do |thin|
  suffix = "diary-#{thin ? "thin" : "normal"}"
  File.write("#{output}/history-progress-#{suffix}.html", history_fixture(thin: thin, sync: true))
  File.write("#{output}/cards-progress-#{suffix}.html", progress_cards_fixture(thin))
  File.write("#{output}/watch-progress-#{suffix}.html", watch_fixture(progress_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2", thin)))
end
File.write("#{output}/history-progress-search.html", history_fixture(history_query: "STUDIO north", sync: true))

File.write("#{output}/signup-account.html", diary_login_fixture("dark", true))
env = signed_in_env("/account")
locale = "en-US"
user = env.get("user").as(User)
error = nil
username_token = password_token = "fixture-csrf"
username = user.username
navbar_search = true
File.write("#{output}/account-settings.html", render "src/invidious/views/user/account.ecr", "src/invidious/views/template.ecr")

def admin_settings_fixture(env)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  env.set "admin_revision", "fixture-revision"
  render "src/invidious/views/admin/settings.ecr", "src/invidious/views/overhaul/shell.ecr"
end

# Retained legacy-form fixtures exercise cached POST compatibility. The default
# category route is rendered separately by settings_entry_checks.cr.
PG_DB.exec("INSERT INTO playlists (title, id, author) VALUES (?, ?, ?)", "Fixture playlist", "IVpreferences", "viewer@example.test")
File.write("#{output}/preferences-signed-in.html", preferences_fixture(signed_in_env("/preferences")))
env = signed_in_env("/preferences")
preferences = env.get("preferences").as(Preferences)
preferences.show_nick = false
env.set "preferences", preferences
File.write("#{output}/preferences-signed-in-no-nick.html", preferences_fixture(env))
CONFIG.admins << "viewer@example.test"
begin
  File.write("#{output}/preferences-admin.html", preferences_fixture(signed_in_env("/preferences")))
  File.write("#{output}/admin-settings.html", admin_settings_fixture(signed_in_env("/admin/settings")))
  CONFIG.login_required = true
  CONFIG.registration_enabled = false
  File.write("#{output}/preferences-admin-private.html", preferences_fixture(signed_in_env("/preferences")))
  File.write("#{output}/admin-settings-private.html", admin_settings_fixture(signed_in_env("/admin/settings")))
ensure
  CONFIG.login_required = false
  CONFIG.registration_enabled = true
  CONFIG.admins.delete("viewer@example.test")
end
File.write("#{output}/preferences-rtl.html", preferences_fixture(fixture_env("/preferences", "dark", locale: "ar")))

# Native clips render production pages with escaped, immutable titles.
def fixture_clip
  video = fixture_video
  InvidiousClip.new({id: "IVCL" + "a" * 32, owner: "viewer@example.test", video_id: video.id,
                     ucid: video.ucid, title: "Moment <script>alert(1)</script> & light", start_ms: 500_i64, end_ms: 5500_i64,
                     created_at: Time.utc(2026, 10, 2), video_title: video.title, channel_name: video.author,
                     video_duration: video.length_seconds, creator: "viewer"})
end

def clips_fixture(channel_page = false, empty = false, locale = "en-US", ai = false, known_views = false)
  env = channel_page ? fixture_env("/channel/#{fixture_clip.ucid}/clips", locale: locale) : signed_in_env("/feed/clips")
  preferences = env.get("preferences").as(Preferences)
  preferences.locale = locale
  env.set "preferences", preferences
  ai_other_preferences(env) if ai
  user = env.get?("user").try(&.as(User))
  subscriptions = [] of String
  clips = empty ? [] of InvidiousClip : [fixture_clip]
  if known_views
    env.set "view_counts", {fixture_clip.video_id => Invidious::Videos::ViewCounts::Count.new(1234_i64, "exact")} of String => Invidious::Videos::ViewCounts::Count?
  end
  page_nav_html = ""
  navbar_search = true
  if channel_page
    channel = AboutChannel.new(ucid: fixture_clip.ucid, author: "Studio North", auto_generated: false,
      author_url: "/channel/#{fixture_clip.ucid}", author_thumbnail: "https://example.test/avatar", banner: nil,
      description: "Channel clips", description_html: "Channel clips", total_views: 123456_i64, sub_count: 1200,
      joined: Time.utc, is_family_friendly: true, pronouns: nil, allowed_regions: [] of String,
      tabs: ["videos", "playlists"], tags: [] of String, verified: true, is_age_gated: false)
    render "src/invidious/views/channel_clips.ecr", "src/invidious/views/template.ecr"
  else
    render "src/invidious/views/feeds/clips.ecr", "src/invidious/views/template.ecr"
  end
end

def create_clip_fixture(locale = "en-US")
  env = signed_in_env("/create_clip?videoId=2isYuQZMbdU")
  preferences = env.get("preferences").as(Preferences)
  preferences.locale = locale
  env.set "preferences", preferences
  video = fixture_video
  clip_title = ""
  clip_start_value = "00:00"
  clip_end_value = "00:30"
  error = nil
  clip_unconfirmed = false
  clip_source_available = true
  clip_csrf = "fixture-token"
  navbar_search = true
  render "src/invidious/views/create_clip.ecr", "src/invidious/views/template.ecr"
end

File.write("#{output}/clip-watch.html", watch_fixture(signed_in_env(fixture_clip.permalink), nil, account: true, native_clip: fixture_clip))
{"dark", "light"}.each do |mode|
  env = signed_in_env("/watch?v=2isYuQZMbdU")
  preferences = env.get("preferences").as(Preferences)
  preferences.dark_mode = mode
  File.write("#{output}/watch-clips-diary-#{mode}.html", watch_fixture(env, nil, account: true, clip_duration: 7205))
end
env = signed_in_env("/watch?v=2isYuQZMbdU")
env.get("preferences").as(Preferences).locale = "ar"
File.write("#{output}/watch-clips-rtl.html", watch_fixture(env, nil, account: true, clip_duration: 7205))
File.write("#{output}/watch-clips-short.html", watch_fixture(signed_in_env("/watch?v=2isYuQZMbdU"), nil, account: true, clip_duration: 5))
File.write("#{output}/clips-library.html", clips_fixture)
File.write("#{output}/clips-empty.html", clips_fixture(empty: true))
File.write("#{output}/channel-clips.html", clips_fixture(channel_page: true))
File.write("#{output}/clips-rtl.html", clips_fixture(locale: "ar"))
File.write("#{output}/create-clip.html", create_clip_fixture)
File.write("#{output}/create-clip-diary.html", create_clip_fixture("id"))

require "./avatar_checks"
require "./comment_avatar_checks"
require "./popular_avatar_checks"
require "./view_count_checks"
check_view_counts(output)
require "./spoiler_checks"
check_spoiler_preferences(output)
write_masking_editor_fixtures(output)
check_ai_filtering(output)

check_audio_playback(output)

require "./original_title_checks"
check_original_titles(output)

# Standalone verification pages never require content data or database access.
def verification_fixture(native = false)
  policy = Invidious::BotProtection::Settings.new(true, 12, 1_i64)
  destination = "/watch?v=abcdefghijk&t=42"
  ready = true
  previous_site_key = CONFIG.turnstile_site_key
  CONFIG.turnstile_site_key = "1x00000000000000000000AA"
  render "src/invidious/views/verification.ecr"
ensure
  CONFIG.turnstile_site_key = previous_site_key || ""
end

File.write("#{output}/verification-browser.html", verification_fixture)
File.write("#{output}/verification-native.html", verification_fixture(true))

# QoL cases use the production pagination and search templates, including POST
# pagination and filtered-empty pages; no upstream search requests are made.
def qol_search_fixture(env, page : Int32, empty = false)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  params = URI::Params{"q" => "light", "page" => page.to_s, "duration" => "short"}
  query = Invidious::Search::Query.new(params, :regular, preferences.region)
  items = [] of SearchVideo
  unless empty
    items << SearchVideo.new({title: "A matching video", id: "aaaaaaaaaaa", author: "Studio North", ucid: "UCfixture", published: Time.utc - 3.days, views: 12_i64, description_html: "A perspective.", length_seconds: 30, premiere_timestamp: nil, author_verified: true, author_thumbnail: nil, badges: VideoBadges::None})
  end
  blocked_results = false
  member_results = false
  redirect_url = "/redirect"
  env.set "search", "light"
  page_nav_html = Invidious::Frontend::Pagination.nav_numeric(locale, base_url: "/search?#{params}", current_page: page, show_next: page < 3, post: Invidious::Frontend::Desktop.private_search?(env))
  navbar_search = true
  render "src/invidious/views/search.ecr", "src/invidious/views/template.ecr"
end

File.write("#{output}/qol-browse.html", browse_fixture(signed_in_env("/feed/popular"), true))
File.write("#{output}/qol-browse-next.html", browse_fixture(signed_in_env("/feed/popular?page=2"), true))
File.write("#{output}/qol-browse-end.html", browse_fixture(signed_in_env("/feed/popular?page=3"), true))
{false, true}.each do |private_search|
  (1..3).each do |page|
    env = signed_in_env("/search")
    prefs = env.get("preferences").as(Preferences)
    prefs.search_privacy = private_search
    env.set "preferences", prefs
    File.write("#{output}/qol-search-#{private_search}-#{page}.html", qol_search_fixture(env, page, page == 2))
  end
end
require "./qol_checks"
check_qol_preferences

def qol_playlist_fixture
  env = signed_in_env("/playlist?list=IVfixture")
  env.set "remove_playlist_items", "IVfixture"
  locale = "en-US"
  items = (0...4).map do |i|
    PlaylistVideo.new({title: "Occurrence #{i + 1}", id: "aaaaaaaaaaa", author: "Studio North", ucid: "UCfixture", length_seconds: 720, published: Time.utc,
                       plid: "IVfixture", index: 9_007_199_254_740_993_i64 + i * 2, live_now: false, members_only: false})
  end
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

File.write("#{output}/qol-playlist.html", qol_playlist_fixture)

# D1 candidates use the production data/helpers/player and the pending shared shell.
def overhaul_settings_fixture(env)
  env.set "settings_section", env.params.query["section"]? || "appearance"
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  render "src/invidious/views/overhaul/settings.ecr", "src/invidious/views/overhaul/shell.ecr"
end

def overhaul_playlist_fixture(env)
  env.set "remove_playlist_items", "IVfixture"
  locale = env.get("preferences").as(Preferences).locale
  items = (0...6).map do |i|
    PlaylistVideo.new({title: "A chapter in light and motion #{i + 1}", id: i.to_s.rjust(11, '0'), author: "Studio North", ucid: "UCfixture", length_seconds: 720, published: Time.utc - 3.days, plid: "IVfixture", index: 9007199254740990_i64 + i, live_now: false, members_only: false})
  end
  render "src/invidious/views/overhaul/playlist.ecr", "src/invidious/views/overhaul/shell.ecr"
end

{"light", "dark", ""}.each do |mode|
  suffix = mode.empty? ? "system" : mode
  {"browse" => "/feed/popular", "watch" => "/watch?v=2isYuQZMbdU&list=PLfixture&index=2", "playlist" => "/playlist?list=IVfixture", "settings" => "/preferences?section=appearance"}.each do |screen, path|
    env = screen == "playlist" ? signed_in_env(path) : fixture_env(path, mode)
    candidate_preferences = env.get("preferences").as(Preferences)
    candidate_preferences.dark_mode = mode
    env.set "preferences", candidate_preferences
    env.set "ui_overhaul_preview", true
    source = case screen
             when "browse"   then browse_fixture(env, true)
             when "watch"    then watch_fixture(env)
             when "playlist" then overhaul_playlist_fixture(env)
             else                 overhaul_settings_fixture(env)
             end
    File.write("#{output}/overhaul-#{screen}-#{suffix}.html", source)
  end
end

# Desktop stress/RTL uses the same candidates, not an alternate design.
{"browse", "watch", "playlist", "settings"}.each do |screen|
  path = {"browse" => "/feed/popular", "watch" => "/watch?v=2isYuQZMbdU&list=PLfixture", "playlist" => "/playlist?list=IVfixture", "settings" => "/preferences?section=appearance"}[screen]
  env = screen == "playlist" ? signed_in_env(path) : fixture_env(path, "light", locale: "ar")
  candidate_preferences = env.get("preferences").as(Preferences)
  candidate_preferences.locale = "ar"
  candidate_preferences.dark_mode = "light"
  env.set "preferences", candidate_preferences
  env.set "ui_overhaul_preview", true
  source = case screen
           when "browse"   then browse_fixture(env, true)
           when "watch"    then watch_fixture(env)
           when "playlist" then overhaul_playlist_fixture(env)
           else                 overhaul_settings_fixture(env)
           end
  File.write("#{output}/overhaul-#{screen}-rtl.html", source)
end
{"light", "dark"}.each do |mode|
  env = fixture_env("/watch?v=2isYuQZMbdU", mode)
  env.set "ui_overhaul_preview", true
  File.write("#{output}/overhaul-watch-single-#{mode}.html", watch_fixture(env, nil))
end

# D2 real category forms for explicit fragment navigation and canonical read-back.
Invidious::WebPreferences::SECTIONS.each_key do |section|
  env = signed_in_env("/preferences?section=#{section}")
  candidate_preferences = env.get("preferences").as(Preferences)
  candidate_preferences.dark_mode = "light"
  env.set "preferences", candidate_preferences
  env.set "ui_overhaul_preview", true
  File.write("#{output}/settings-#{section}.html", overhaul_settings_fixture(env))
end

# Literal failed map controls and future saved native values must remain visible.
{"invalid", "future"}.each do |kind|
  env = signed_in_env("/preferences?section=sponsorblock")
  preferences = env.get("preferences").as(Preferences)
  values = Invidious::WebPreferences.values("sponsorblock", JSON.parse(preferences.to_json).as_h)
  if kind == "invalid"
    env.set "settings_draft", URI::Params.encode({"sponsorblock_mode_intro" => "manual<draft>&", "sponsorblock_color_intro" => "color<draft>&"})
    env.set "settings_error", "Invalid SponsorBlock draft retained"
  else
    values["sponsorblock_modes"].as_h["intro"] = JSON::Any.new("future<mode>&")
    values["sponsorblock_colors"].as_h["intro"] = JSON::Any.new("future<color>&")
  end
  env.set "settings_values", values.to_json
  File.write("#{output}/d6-sb-defaults-#{kind}.html", overhaul_settings_fixture(env))
end

# D3 production templates, including a POST whose saved privacy preference is
# off: method privacy cannot depend on the preference alone.
def d3_search_fixture(mode = "light", privacy = false, literal = false, scope = "")
  env = fixture_env("/search", mode, method: privacy ? "POST" : "GET")
  preferences = env.get("preferences").as(Preferences)
  preferences.search_privacy = false
  env.set "preferences", preferences
  locale = preferences.locale
  text = literal ? "\\https://youtu.be/aaaaaaaaaaa" : "light"
  text = "subscriptions:true #{text}" if scope == "subscriptions"
  text = "channel:UCfixture #{text}" if scope == "channel"
  params = HTTP::Params{"q" => text}
  if scope.empty?
    params["duration"] = "short"
    params["features"] = "hd,subtitles"
  end
  query = Invidious::Search::Query.new(params, :regular, "ID")
  items = [] of SearchItem
  items << SearchVideo.new({title: "An observed moment <&> العربية 日本語", id: "aaaaaaaaaaa", author: "Studio North", ucid: "UCfixture", published: Time.utc - 3.days, views: 0_i64, description_html: "A perspective.", length_seconds: 720, premiere_timestamp: nil, author_verified: true, author_thumbnail: "https://yt3.ggpht.com/supplied=s88", badges: VideoBadges::None})
  items << SearchChannel.new({author: "Studio North", ucid: "UCfixture", author_thumbnail: "https://yt3.ggpht.com/supplied=s88", subscriber_count: 0, video_count: 0, channel_handle: "@studio", description_html: "A channel about &lt;light&gt; and everyday observations.", auto_generated: false, author_verified: true})
  items << SearchPlaylist.new({title: "Empty collection", id: "PLempty", author: "Studio North", ucid: "UCfixture", video_count: 0, videos: [] of SearchPlaylistVideo, thumbnail: nil, author_verified: false})
  items << SearchHashtag.new({title: "#light", url: "/hashtag/light", video_count: 42_i64, channel_count: 3_i64})
  items << ProblematicTimelineItem.new(Exception.new("Unrecognized <upstream> item"))
  blocked_results = member_results = false
  redirect_url = "/redirect"
  env.set "search", text
  page_nav_html = Invidious::Frontend::Pagination.nav_numeric(locale, base_url: "/search?#{query.to_http_params}", current_page: 1, post: Invidious::Frontend::Desktop.private_search?(env))
  navbar_search = true
  render "src/invidious/views/search.ecr", "src/invidious/views/template.ecr"
end

{false, true}.each do |privacy|
  File.write("#{output}/d3-search-#{privacy}.html", d3_search_fixture(privacy: privacy))
  File.write("#{output}/d3-search-literal-#{privacy}.html", d3_search_fixture(privacy: privacy, literal: true))
end
File.write("#{output}/d3-search-subscriptions.html", d3_search_fixture(scope: "subscriptions"))
File.write("#{output}/d3-search-channel.html", d3_search_fixture(scope: "channel"))
{"light", "dark"}.each do |mode|
  env = fixture_env("/search", mode)
  locale = "en-US"
  preferences = env.get("preferences").as(Preferences)
  navbar_search = false
  File.write("#{output}/d3-search-home-#{mode}.html", render("src/invidious/views/search_homepage.ecr", "src/invidious/views/template.ecr"))
end

def d3_thread_data
  JSON.parse({
    "authorId"     => "UCfixture",
    "continuation" => "more+/= &?日本語",
    "comments"     => [
      {"commentId" => "post-a", "author" => "Studio <North>", "authorUrl" => "/channel/UCfixture", "authorThumbnail" => "https://yt3.ggpht.com/supplied=s88", "authorIsChannelOwner" => true, "verified" => true, "contentHtml" => "A moment of light.<br>With a second line.", "published" => (Time.utc - 1.day).to_unix, "isEdited" => true, "likeCount" => 0, "replyCount" => 3, "replies" => {"replyCount" => 3, "continuation" => "thread-a+/= &?日本語"}, "attachment" => {"type" => "multiImage", "images" => [[{"url" => "https://yt3.ggpht.com/photo-a"}, {"url" => "https://yt3.ggpht.com/photo-a"}], [{"url" => "https://yt3.ggpht.com/photo-b"}, {"url" => "https://yt3.ggpht.com/photo-b"}]]}},
      {"commentId" => "post-b", "author" => "Another observer", "authorUrl" => "/channel/UCother", "authorThumbnails" => [] of String, "authorIsChannelOwner" => false, "contentHtml" => "A second post with its own replies.", "published" => (Time.utc - 2.days).to_unix, "isEdited" => false, "likeCount" => 12, "replyCount" => 2, "replies" => {"replyCount" => 2, "continuation" => "thread-b+/= &?日本語"}, "attachment" => {"type" => "video", "videoId" => "aaaaaaaaaaa"}},
      {"commentId" => "post-c", "author" => "A reader", "authorUrl" => "/channel/UCother", "authorThumbnails" => [] of String, "authorIsChannelOwner" => false, "contentHtml" => "No reply cursor from another post belongs here.", "published" => (Time.utc - 2.days).to_unix, "isEdited" => false, "likeCount" => 0, "replyCount" => 0},
    ],
  }.to_json)
end

def d3_community_fixture(mode = "light")
  env = fixture_env("/channel/UCfixture/community", mode)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  user = nil
  subscriptions = [] of String
  sort_options = [] of String
  sort_by = ""
  channel = AboutChannel.new(ucid: "UCfixture", author: "Studio North", auto_generated: false,
    author_url: "/channel/UCfixture", author_thumbnail: "https://example.test/avatar", banner: nil,
    description: "A community of observers.", description_html: "A community of observers.", total_views: 123456_i64, sub_count: 1200,
    joined: Time.utc, is_family_friendly: true, pronouns: nil, allowed_regions: [] of String,
    tabs: ["videos", "shorts", "streams", "playlists", "community", "podcasts", "releases", "courses", "channels"], tags: [] of String, verified: true, is_age_gated: false)
  items = d3_thread_data
  error_message = nil
  navbar_search = true
  render "src/invidious/views/community.ecr", "src/invidious/views/template.ecr"
end

{"light", "dark"}.each do |mode|
  File.write("#{output}/d3-community-#{mode}.html", d3_community_fixture(mode))
end
File.write("#{output}/d3-thread-response.json", {"contentHtml" => Invidious::Frontend::Comments.template_youtube(d3_thread_data, "en-US", false), "commentCount" => 3}.to_json)
File.write("#{output}/d3-thread-end.json", {"contentHtml" => "<article class=\"comment comment-no-avatar\"><div class=\"comment-main\"><div class=\"comment-author\"><a href=\"/channel/UCother\">A reply</a></div><p>Reply body.</p></div></article>"}.to_json)

File.write("#{output}/d3-channel-more.html", diary_channel_fixture(playlists: true, secondary: "Podcasts"))

# Standalone post and no-JavaScript comments use the same production fragments.
def d3_post_fixture(mode = "light", nojs = false)
  env = fixture_env("/post/post-a", mode)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  id = "post-a"
  ucid = "UCfixture"
  post_response = JSON.parse({"authorId" => ucid, "singlePost" => true, "comments" => [d3_thread_data["comments"][0].as_h.reject { |key, _| key == "replies" }]}.to_json)
  response = JSON.parse({"postId" => id, "comments" => d3_thread_data["comments"], "continuation" => "post-more+/= &?日本語"}.to_json)
  comment_html = Invidious::Frontend::Comments.template_youtube(response, locale, false)
  navbar_search = true
  render "src/invidious/views/post.ecr", "src/invidious/views/template.ecr"
end

{"light", "dark"}.each do |mode|
  File.write("#{output}/d3-post-#{mode}.html", d3_post_fixture(mode))
  File.write("#{output}/d3-post-nojs-#{mode}.html", d3_post_fixture(mode, true))
  File.write("#{output}/d3-search-#{mode}.html", d3_search_fixture(mode))
end

def d3_discovery_fixture(screen, mode = "light", empty = false)
  env = fixture_env("/feed/#{screen}", mode)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  navbar_search = true
  if screen == "trending"
    trending_type = "Gaming"
    region = "ID"
    trending = empty ? [] of SearchVideo : (0...12).map { |i| SearchVideo.new({title: "An observed moment #{i + 1}", id: "aaaaaaaaaaa", author: "Studio North", ucid: "UCfixture", published: Time.utc - 3.days, views: i.to_i64, description_html: "", length_seconds: 720, premiere_timestamp: nil, author_verified: true, author_thumbnail: nil, badges: VideoBadges::None}) }
    plid = empty ? nil : "PLtrending"
    render "src/invidious/views/feeds/trending.ecr", "src/invidious/views/template.ecr"
  else
    previous = popular_videos
    begin
      samples = empty ? [] of ChannelVideo : (0...12).map { |i| ChannelVideo.new({title: "An observed moment #{i + 1}", id: "aaaaaaaaaaa", author: "Studio North", ucid: "UCfixture", published: Time.utc - 3.days, updated: Time.utc, views: i.to_i64, length_seconds: 720, live_now: false, premiere_timestamp: nil, members_only: false}) }
      Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.set(samples)
      render "src/invidious/views/feeds/popular.ecr", "src/invidious/views/template.ecr"
    ensure
      Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.set(previous)
    end
  end
end

{"light", "dark"}.each do |mode|
  {"popular", "trending"}.each do |screen|
    File.write("#{output}/d3-#{screen}-#{mode}.html", d3_discovery_fixture(screen, mode))
    File.write("#{output}/d3-#{screen}-empty-#{mode}.html", d3_discovery_fixture(screen, mode, true))
  end
end
File.write("#{output}/d3-channel-search-literal.html", diary_channel_fixture(search: true, privacy: true, literal: true))

# Continuation controls preserve filters without mutating their caller's params.
token = "opaque+/= &?日本語"
nav_params = URI::Params{"sort_by" => "oldest", "continuation" => "old"}
nav_before = nav_params.to_s
nav = Invidious::Frontend::Pagination.nav_ctoken("en-US", base_url: "/channel/UCfixture", ctoken: token, first_page: false, params: nav_params)
raise "Pagination mutated its caller" unless nav_params.to_s == nav_before
raise "Continuation token was not safely preserved" unless nav.includes?("continuation=#{URI.encode_www_form(token)}")
raise "First-page filter lost" unless nav.includes?("href=\"/channel/UCfixture?sort_by=oldest\"")

require "./library_checks"
write_library_fixtures(output)

require "./watch_checks"
write_watch_fixtures(output)
require "./watch_enhancement_checks"
write_watch_enhancement_fixtures(output)
write_clip_editor_fixtures(output)
write_clip_secondary_fixtures(output)
write_watch_utility_fixtures(output)
write_chat_settings_fixtures(output)

require "./blocked_channels_checks"
write_blocked_channels_fixtures(output)
File.write("#{output}/d6-block-context-popular.html", block_context_fixture("/feed/popular"))
File.write("#{output}/d6-block-context-filtered.html", block_context_fixture("/feed/popular", true))
File.write("#{output}/d6-block-context-library.html", block_context_fixture("/feed/history"))

require "./dearrow_identity_editor_checks"
write_identity_editor_fixtures(output)

require "./dearrow_contribution_editor_checks"
write_contribution_editor_fixtures(output)

require "./settings_entry_checks"
write_settings_entry_fixtures(output)
File.write("#{output}/runtime-owner-states.json", Invidious::Frontend::Desktop.fixture_owner_states.to_json)

require "./account_surface_checks"
write_account_surface_fixtures(output)

require "./data_surface_checks"
write_data_surface_fixtures(output)

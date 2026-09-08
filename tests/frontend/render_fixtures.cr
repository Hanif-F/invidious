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

CONFIG             = Config.from_yaml("hmac_key: frontend-fixtures\n")
HMAC_KEY           = "frontend-fixtures"
PG_DB              = DB.open("sqlite3::memory:")
HOST_URL           = "https://invidious.test"
MAX_ITEMS_PER_PAGE = 1500
CURRENT_BRANCH     = "fixture"
CURRENT_COMMIT     = "fixture"
CURRENT_VERSION    = "fixture"
CURRENT_TAG        = ""
ASSET_COMMIT       = "fixture"
OUTPUT             = File.open(File::NULL, "w")
LOGGER             = Invidious::LogHandler.new(OUTPUT, LogLevel::Off)
YT_POOL            = YoutubeConnectionPool.new(URI.parse("https://www.youtube.com"), capacity: 1)
GGPHT_POOL         = YoutubeConnectionPool.new(URI.parse("https://yt3.ggpht.com"), capacity: 1)
COMPANION_POOL     = CompanionConnectionPool.new(capacity: 1)

def fixture_env(path, theme = "dark", thin = false, density = "balanced", locale = "en-US")
  preferences = Preferences.from_json({"dark_mode" => theme, "thin_mode" => thin, "ui_density" => density, "locale" => locale, "comments" => ["", ""], "preload" => false}.to_json)
  env = HTTP::Server::Context.new(HTTP::Request.new("GET", path), HTTP::Server::Response.new(IO::Memory.new))
  env.set "preferences", preferences
  env.set "current_page", path
  env
end

def fixture_video
  raw = JSON.parse(File.read("mocks/video/regular_mrbeast.player.json")).as_h
  raw.merge!(JSON.parse(File.read("mocks/video/regular_mrbeast.next.json")).as_h)
  info = Invidious::Videos::Parser.parse_video_info("2isYuQZMbdU", raw)
  info["title"] = JSON::Any.new("A journey through light, color, and motion")
  info["author"] = JSON::Any.new("Studio North")
  info["descriptionHtml"] = JSON::Any.new("A closer look at the small details that make a world.\n0:00 Introduction\n1:20 Finding the light\n3:45 Color in motion")
  info["description"] = info["descriptionHtml"]
  info["shortDescription"] = info["descriptionHtml"]
  info["captions"] = JSON.parse(%({"playerCaptionsTracklistRenderer":{"captionTracks":[{"name":{"simpleText":"English"},"languageCode":"en","baseUrl":"https://example.com/en"},{"name":{"simpleText":"Indonesian (auto-generated)"},"languageCode":"id","kind":"asr","baseUrl":"https://example.com/id"}]}}))
  Video.new({id: "2isYuQZMbdU", info: info, updated: Time.utc})
end

def watch_fixture(env, plid : String? = "PLfixture")
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  video = fixture_video
  id = video.id
  continuation = 2
  params = Invidious::Videos.process_video_params(URI::Params.new, preferences)
  params.comments = ["", ""]
  params.quality = "medium"
  params.vr_mode = false
  playback_sync = false
  playback_position = nil
  user = nil.as(Invidious::User?)
  subscriptions = [] of String
  nojs = false
  comment_html = ""
  thumbnail = "/vi/#{id}/maxres.jpg"
  aspect_ratio = "16:9"
  invidious_companion = nil.as(Config::CompanionConfig?)
  video_streams = video.video_streams
  audio_streams = video.audio_streams
  fmt_stream = [JSON.parse(%({"mimeType":"video/webm","itag":43,"quality":"medium","url":"/fixture.webm"})).as_h]
  adaptive_fmts = video.adaptive_fmts
  captions = video.captions
  preferred_captions = [] of Invidious::Videos::Captions::Metadata
  video_assets = Invidious::Frontend::WatchPage::VideoAssets.new(fmt_stream, video_streams, audio_streams, captions)
  navbar_search = true
  render "src/invidious/views/watch.ecr", "src/invidious/views/template.ecr"
end

def browse_fixture(env)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  items = (0...12).map do |i|
    SearchVideo.new({title: ["The art of noticing", "An ordinary day, beautifully observed", "Finding color in unexpected places"][i % 3], id: "fixture#{i}", author: "Studio North", ucid: "UCfixture", published: Time.utc - 3.days, views: 123456_i64, description_html: "A new perspective.", length_seconds: 720, premiere_timestamp: nil, author_verified: true, author_thumbnail: nil, badges: VideoBadges::None})
  end
  navbar_search = true
  page_nav_html = "<nav class=page-navigation><a class=pure-button href=?page=2>Next page</a></nav>"
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

def preferences_fixture(env)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  referer = "/"
  navbar_search = true
  render "src/invidious/views/user/preferences.ecr", "src/invidious/views/template.ecr"
end

def playlist_library_fixture
  env = signed_in_env("/feed/playlists")
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  items_created = (0...4).map do |i|
    SearchPlaylist.new({title: "Light and motion #{i + 1}", id: "PLfixture#{i}", author: "Studio North", ucid: "UCfixture", video_count: 12, videos: [] of SearchPlaylistVideo, thumbnail: "/vi/2isYuQZMbdU/mqdefault.jpg", author_verified: false})
  end
  items_saved = items_created.first(2)
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
  user = Invidious::User.new({updated: Time.utc, notifications: [] of String, subscriptions: [] of String, email: "viewer@example.test", preferences: env.get("preferences").as(Preferences), password: nil, token: "fixture", watched: [] of String, feed_needs_update: false})
  env.set "user", user
  env.set "csrf_token", "fixture-token"
  env
end

def navigation_fixture
  env = signed_in_env("/feed/subscriptions")
  preferences = env.get("preferences").as(Preferences)
  preferences.feed_menu = ["Popular", "Trending"]
  locale = preferences.locale
  render "src/invidious/views/components/navigation.ecr"
end

def history_fixture
  env = signed_in_env("/feed/history")
  user = env.get("user").as(User)
  user.watched = ["2isYuQZMbdU", "previous001", "nextvideo01"]
  watched = user.watched
  history_titles = {"2isYuQZMbdU" => "A journey through light, color, and motion", "previous001" => "Light <study> & color"}
  locale = user.preferences.locale
  page = 1
  max_results = 20
  base_url = "/feed/history"
  navbar_search = true
  render "src/invidious/views/feeds/history.ecr", "src/invidious/views/template.ecr"
end

raise "Density default changed" unless Preferences.from_json("{}").ui_density == "balanced"
raise "Invalid density accepted" unless Preferences.from_json(%({"ui_density":"unknown"})).ui_density == "balanced"
raise "Density round trip failed" unless Preferences.from_json(Preferences.from_json(%({"ui_density":"compact"})).to_json).ui_density == "compact"
raise "Invalid YAML density accepted" unless Preferences.from_yaml("ui_density: unknown").ui_density == "balanced"

output = ENV["FRONTEND_FIXTURES"]? || "tests/frontend/.generated"
Dir.mkdir_p(output)
{"dark", "light", ""}.each do |theme|
  suffix = theme.empty? ? "auto" : theme
  File.write("#{output}/watch-#{suffix}.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2", theme)))
  File.write("#{output}/browse-#{suffix}.html", browse_fixture(fixture_env("/feed/popular", theme)))
end
File.write("#{output}/watch-single.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU"), nil))
File.write("#{output}/watch-thin.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2", "dark", true)))
File.write("#{output}/browse-compact.html", browse_fixture(fixture_env("/feed/popular", "dark", false, "compact")))
File.write("#{output}/watch-rtl.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU&list=PLfixture&index=2", "dark", false, "balanced", "ar")))
File.write("#{output}/preferences.html", preferences_fixture(fixture_env("/preferences")))
File.write("#{output}/queue.json", queue_fixture)
File.write("#{output}/queue-thin.json", queue_fixture(true))
File.write("#{output}/browse-signed-in.html", browse_fixture(signed_in_env("/feed/popular")))
File.write("#{output}/navigation-subscribed.html", navigation_fixture)
File.write("#{output}/history.html", history_fixture)
File.write("#{output}/playlist-library.html", playlist_library_fixture)
puts "Rendered frontend fixtures to #{output}"

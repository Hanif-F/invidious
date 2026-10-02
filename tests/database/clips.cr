# Integration tests using production account services, routes, and templates.
# Requires an empty disposable PostgreSQL database; never contacts YouTube.
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
CLIPS_TEST_URL       = ENV["CLIPS_TEST_DATABASE_URL"]
abort "A disposable invidious_clips_test database is required" unless URI.parse(CLIPS_TEST_URL).path == "/invidious_clips_test"
PG_DB = DB.open(CLIPS_TEST_URL)
HOST_URL = "https://invidious.test"
MAX_ITEMS_PER_PAGE = 1500
CURRENT_BRANCH = "fixture"
CURRENT_COMMIT = "fixture"
CURRENT_VERSION = "fixture"
CURRENT_TAG = ""
ASSET_COMMIT = "fixture"
SOFTWARE = {"version" => "fixture", "branch" => "fixture"}
OUTPUT = File.open(File::NULL, "w")
LOGGER = Invidious::LogHandler.new(OUTPUT, LogLevel::Off)
YT_POOL = YoutubeConnectionPool.new(URI.parse("https://www.youtube.com"), capacity: 1)
GGPHT_POOL = YoutubeConnectionPool.new(URI.parse("https://yt3.ggpht.com"), capacity: 1)
COMPANION_POOL = CompanionConnectionPool.new(capacity: 1)

def check(value, message)
  raise message unless value
end

class ClipTestEndpoint
  include HTTP::Handler

  def call(context)
    env = context
    Invidious::Routes::BeforeAll.handle(env)
    path = env.request.path
    result = case path
             when "/api/v1/auth/clips"
               env.request.method == "POST" ? Invidious::Routes::API::V1::Clips.create(env) : Invidious::Routes::API::V1::Clips.index(env)
             when .starts_with?("/api/v1/auth/clips/")
               env.params.url["id"] = path.split('/').last
               Invidious::Routes::API::V1::Clips.delete(env)
             when .starts_with?("/api/v1/clips/")
               env.params.url["id"] = path.split('/').last
               Invidious::Routes::API::V1::Videos.clips(env)
             when .starts_with?("/api/v1/channels/")
               env.params.url["ucid"] = path.split('/')[4]
               Invidious::Routes::API::V1::Clips.channel(env)
             when "/feed/clips"
               Invidious::Routes::Clips.index(env)
             when "/create_clip"
               env.request.method == "POST" ? Invidious::Routes::Clips.create(env) : Invidious::Routes::Clips.new_page(env)
             when "/delete_clip"
               env.request.method == "POST" ? Invidious::Routes::Clips.delete(env) : Invidious::Routes::Clips.delete_page(env)
             when .starts_with?("/clip/")
               env.params.url["clip"] = path.split('/').last
               Invidious::Routes::Watch.clip(env)
             else
               ""
             end
    env.set "test_result", result.to_s
  end
end

def clip_request(method, path, sid = nil, bearer = nil, body = "", content_type = "application/json", csrf = nil)
  headers = HTTP::Headers{"Content-Type" => content_type}
  headers["Cookie"] = "SID=#{sid}" if sid
  headers["Authorization"] = "Bearer #{bearer}" if bearer
  headers["X-CSRF-Token"] = csrf if csrf
  env = HTTP::Server::Context.new(HTTP::Request.new(method, path, headers, body), HTTP::Server::Response.new(IO::Memory.new))
  handler = AuthHandler.new
  handler.next = ClipTestEndpoint.new
  handler.call(env)
  env
end

def result(env)
  env.get?("test_result").try(&.as(String)) || ""
end

def clip_schema
  {
    columns:     PG_DB.query_all("SELECT column_name || ':' || data_type || ':' || is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clips' ORDER BY ordinal_position", as: String),
    constraints: PG_DB.query_all("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.clips'::regclass ORDER BY conname", as: String),
    indexes:     PG_DB.query_all("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'clips' ORDER BY indexname", as: String),
  }
end

def cached_clip_video
  raw = JSON.parse(File.read("mocks/video/regular_mrbeast.player.json")).as_h
  raw.merge!(JSON.parse(File.read("mocks/video/regular_mrbeast.next.json")).as_h)
  info = Invidious::Videos::Parser.parse_video_info("2isYuQZMbdU", raw)
  info["version"] = JSON::Any.new(Video::SCHEMA_VERSION.to_i64)
  info["storyboards"] = JSON.parse("{}")
  Video.new({id: "2isYuQZMbdU", info: info, updated: Time.utc})
end

def clip_account(email, username)
  preferences = Preferences.from_json(%({"watch_history":false,"save_player_pos":true,"comments":["",""]}))
  user = User.new({updated: Time.utc, notifications: [] of String, subscriptions: [] of String,
                   email: email, username: username, credential_version: 1, preferences: preferences, password: nil,
                   token: "test", watched: [] of String, feed_needs_update: false})
  Invidious::Database::Users.insert(user)
  user
end

# Exercise legacy dispatch using a deterministic resolver; never contact YouTube.
module YoutubeAPI
  def resolve_url(url : String, client_config : ClientConfig | Nil = nil)
    raise "Unexpected upstream resolution: #{url}" unless url == "https://www.youtube.com/clip/UgkxLegacy"
    fields = JSON.parse({"50:0:embedded" => {"1:0:varint" => 0, "2:1:varint" => 1234,
                                             "3:2:varint" => 6234, "4:3:string" => "Legacy title"}}.to_json)
    params = URI.encode_www_form(Base64.strict_encode(Protodec::Any.from_json(fields)))
    JSON.parse({"endpoint" => {"watchEndpoint" => {"videoId" => "2isYuQZMbdU", "params" => params}}}.to_json)
  end
end

check(PG_DB.query_one("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'", as: Int64) == 0, "Requires an EMPTY disposable database")
begin
  %w(users session_ids nonces videos blocked_channels playlists).each do |table|
    PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/#{table}.sql")) }
  end
  Invidious::Database::Migrator.migrations.reject! { |migration| migration != Invidious::Database::Migrations::CreateClipsTable }
  migrator = Invidious::Database::Migrator.new(PG_DB)
  migrator.migrate
  migrator.migrate
  check(PG_DB.query_one("SELECT count(*) FROM invidious_migrations WHERE version = 19", as: Int64) == 1, "Migration ran twice")
  alice = clip_account("internal-a", "Alice")
  bob = clip_account("internal-b", "Bob")
  Invidious::Database::SessionIDs.insert("alice-session", alice.email)
  Invidious::Database::SessionIDs.insert("bob-session", bob.email)
  video = cached_clip_video
  Invidious::Database::Videos.insert(video)
  legacy = clip_request("GET", "/clip/UgkxLegacy")
  check(legacy.response.status_code == 302 && legacy.response.headers["Location"].includes?("start=1.234"), "Legacy clip redirect changed")
  legacy_api = clip_request("GET", "/api/v1/clips/UgkxLegacy")
  legacy_data = JSON.parse(result(legacy_api))
  check(legacy_data["clipTitle"].as_s == "Legacy title" && legacy_data["endTime"].as_f == 6.234 && !legacy_data["type"]?, "Legacy API shape changed")
  payload = {videoId: video.id, title: "  A <script> & moment  ", startTime: 1.234, endTime: 6.234}.to_json
  token = generate_token(alice.email, ["GET:clips", "POST:clips", "DELETE:clips/*"], nil, HMAC_KEY, "alice-session")
  reader = generate_token(alice.email, ["GET:clips"], nil, HMAC_KEY, "alice-session")
  check(clip_request("POST", "/api/v1/auth/clips", bearer: reader, body: payload).response.status_code == 403, "Restricted token created clip")
  check(clip_request("POST", "/api/v1/auth/clips", "alice-session", body: payload).response.status_code == 403, "Missing CSRF accepted")
  check(clip_request("POST", "/api/v1/auth/clips", "alice-session", body: payload, csrf: "invalid").response.status_code == 403, "Invalid CSRF accepted")
  created = clip_request("POST", "/api/v1/auth/clips", bearer: token, body: payload)
  check(created.response.status_code == 201, "Creation failed: #{result(created)}")
  data = JSON.parse(result(created))
  id = data["clipId"].as_s
  check(data["clipTitle"].as_s == "A <script> & moment", "Title was not trimmed")
  check(data["startTime"].as_f == 1.234 && data["creator"].as_s == "Alice", "Native metadata incorrect")
  check(!result(created).includes?(alice.email), "Internal owner leaked")
  check(created.response.headers["Cache-Control"].includes?("no-store"), "Authenticated response is cacheable")
  invalid = {videoId: video.id, title: "bad", startTime: 0, endTime: 4.999}.to_json
  check(clip_request("POST", "/api/v1/auth/clips", bearer: token, body: invalid).response.status_code == 400, "Invalid duration accepted")
  check(clip_request("POST", "/api/v1/auth/clips", bearer: token, body: "{").response.status_code == 400, "Malformed JSON accepted")
  video.info["videoType"] = JSON::Any.new("Livestream")
  Invidious::Database::Videos.update(video)
  check(clip_request("POST", "/api/v1/auth/clips", bearer: token, body: payload).response.status_code == 400, "Active livestream accepted")
  video.info["videoType"] = JSON::Any.new("Video")
  Invidious::Database::Videos.update(video)
  video.info["videoType"] = JSON::Any.new("Scheduled")
  video.info["published"] = JSON::Any.new((Time.utc + 1.hour).to_rfc3339)
  Invidious::Database::Videos.update(video)
  check(clip_request("POST", "/api/v1/auth/clips", bearer: token, body: payload).response.status_code == 400, "Upcoming premiere accepted")
  video = cached_clip_video
  Invidious::Database::Videos.update(video)
  video.info["playabilityStatus"] = JSON.parse(%({"status":"LOGIN_REQUIRED"}))
  Invidious::Database::Videos.update(video)
  check(clip_request("POST", "/api/v1/auth/clips", bearer: token, body: payload).response.status_code == 400, "Inaccessible source accepted")
  video.info.delete("playabilityStatus")
  video.upcoming = true
  Invidious::Database::Videos.update(video)
  check(clip_request("POST", "/api/v1/auth/clips", bearer: token, body: payload).response.status_code == 400, "Upcoming source without a timestamp accepted")
  video.upcoming = false
  Invidious::Database::Videos.update(video)
  public_clip = clip_request("GET", "/api/v1/clips/#{id}")
  check(public_clip.response.status_code == 200 && !result(public_clip).includes?(alice.email), "Public metadata leaked owner")
  channel = clip_request("GET", "/api/v1/channels/#{video.ucid}/clips")
  check(JSON.parse(result(channel)).as_a.size == 1, "Public channel omitted clip")
  check(JSON.parse(result(clip_request("GET", "/api/v1/auth/clips", "bob-session"))).as_a.empty?, "My Clips crossed accounts")
  check(JSON.parse(result(clip_request("GET", "/api/v1/auth/clips", "alice-session"))).as_a.size == 1, "My Clips omitted owned clip")
  check(clip_request("GET", "/feed/clips").response.headers["Location"].starts_with?("/login?"), "Guest library did not request login")
  guest_create = clip_request("GET", "/create_clip?videoId=#{video.id}&startTime=10")
  check(guest_create.response.headers["Location"].includes?("startTime"), "Login return lost creation selection")
  form = result(clip_request("GET", "/create_clip?videoId=#{video.id}", "alice-session"))
  check(form.includes?("name=\"startTime\"") && form.includes?("method=\"post\""), "No-JavaScript creation form missing")
  centered = XML.parse_html(result(clip_request("GET", "/create_clip?videoId=#{video.id}&startTime=60", "alice-session")))
  check(centered.xpath_string("string(//input[@id='clip-start']/@value)").to_f == 45.0 && centered.xpath_string("string(//input[@id='clip-end']/@value)").to_f == 75.0, "Default range is not centered on playback")
  form_token = XML.parse_html(form).xpath_string("string(//form[@id='clip-editor']/input[@name='csrf_token']/@value)")
  submitted = clip_request("POST", "/create_clip", "alice-session",
    body: URI::Params.encode({"csrf_token" => form_token, "videoId" => video.id, "title" => "Form clip", "startTime" => "10", "endTime" => "15"}),
    content_type: "application/x-www-form-urlencoded")
  check(submitted.response.status_code == 302, "Ordinary creation form could not publish")
  form_clip_id = submitted.response.headers["Location"].split('/').last
  delete_form = result(clip_request("GET", "/delete_clip?id=#{form_clip_id}", "alice-session"))
  delete_token = XML.parse_html(delete_form).xpath_string("string(//form[@action='/delete_clip']/input[@name='csrf_token']/@value)")
  removed = clip_request("POST", "/delete_clip", "alice-session",
    body: URI::Params.encode({"csrf_token" => delete_token, "id" => form_clip_id}), content_type: "application/x-www-form-urlencoded")
  check(removed.response.status_code == 302 && Invidious::Database::Clips.select(form_clip_id).nil?, "Ordinary deletion form failed")
  check(clip_request("DELETE", "/api/v1/auth/clips/#{id}", "bob-session", csrf: generate_response("bob-session", {"DELETE:*"}, HMAC_KEY)).response.status_code == 404, "Foreign owner deleted clip")
  check(clip_request("POST", "/delete_clip", "alice-session", body: URI::Params.encode({"id" => id}), content_type: "application/x-www-form-urlencoded").response.status_code == 403, "Form deletion missing CSRF accepted")
  check(result(clip_request("GET", "/delete_clip?id=#{id}", "alice-session")).includes?("Delete this clip permanently?"), "Deletion confirmation missing")
  PG_DB.exec("UPDATE users SET username = 'Renamed' WHERE email = $1", alice.email)
  check(JSON.parse(result(clip_request("GET", "/api/v1/clips/#{id}")))["creator"].as_s == "Renamed", "Attribution retained stale username")
  watch = clip_request("GET", "/clip/#{id}?t=100&start=200&end=300&list=bad&raw=1&quality=medium")
  check(watch.response.status_code == 200, "Clip watch failed: #{result(watch)[0, Math.min(result(watch).size, 200)]}")
  html = result(watch)
  check(html.includes?("A &lt;script&gt; &amp; moment") && !html.includes?("<script> & moment"), "Clip title not escaped")
  json_text = html.match(/<script id="video_data" type="application\/json">(.*?)<\/script>/m).not_nil![1]
  playback = JSON.parse(json_text)
  check(playback["params"]["video_start"].as_f == 1.234 && playback["params"]["video_end"].as_f == 6.234, "Incoming timestamps overrode saved range")
  check(!playback["playback_sync"].as_bool && !playback["play_next"].as_bool && playback["plid"].raw.nil?, "Clip resumed or advanced full video")
  check(!html.includes?("twitter:player") && !html.includes?("id=\"link-iv-embed\"") && !html.includes?("id=\"link-yt-embed\""), "Native clip advertised a source embed")
  video.info["lengthSeconds"] = JSON::Any.new(5_i64)
  Invidious::Database::Videos.update(video)
  check(clip_request("GET", "/clip/#{id}").response.status_code == 503, "Shortened source still played saved range")
  check(Invidious::Database::Clips.select(id) != nil, "Unavailable clip was removed")
  Invidious::Database::Videos.delete(video.id)
  check(Invidious::Database::Clips.list(video.ucid, owned: false).size == 1, "Cache eviction removed clip")
  Invidious::Database::Videos.insert(cached_clip_video)
  base = Invidious::Database::Clips.select(id).not_nil!
  31.times do |index|
    item = base
    item.id = "IVCL#{index.to_s.rjust(32, '0')}"
    Invidious::Database::Clips.insert(item)
  end
  first = Invidious::Database::Clips.list(alice.email, owned: true)
  second = Invidious::Database::Clips.list(alice.email, owned: true, page: 2)
  check(first.size == 30 && second.size == 2 && (first.map(&.id) & second.map(&.id)).empty?, "Pagination duplicates/misses clips")
  check(first.map(&.id) == first.map(&.id).sort.reverse, "Tie ordering unstable")
  deletion = clip_request("DELETE", "/api/v1/auth/clips/#{id}", bearer: token)
  check(deletion.response.status_code == 204 && clip_request("GET", "/clip/#{id}").response.status_code == 404, "Deleted permalink remains available")
  PG_DB.exec("DELETE FROM users WHERE email = $1", alice.email)
  check(Invidious::Database::Clips.list(video.ucid, owned: false).empty?, "Account deletion retained clips")
  # Fresh SQL must recreate the same complete constraints/indexes as migration 19.
  migrated_schema = clip_schema
  PG_DB.exec("DROP TABLE clips")
  PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/clips.sql")) }
  check(clip_schema == migrated_schema, "Fresh schema differs from migration 19")
  check(PG_DB.query_one("SELECT count(*) FROM pg_indexes WHERE tablename = 'clips'", as: Int64) == 3, "Fresh schema indexes missing")
  puts "Native clip database, route, authorization, cache, pagination, and fresh-schema checks passed"
ensure
  PG_DB.close
end

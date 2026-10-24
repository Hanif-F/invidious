# Run the production Video accessor, storyboard parser, serializers and API routes
# with synthetic metadata and cache boundaries; no database or YouTube is used.
require "kemal"
require "db"
require "xml"
require "http/server/handlers/compress_handler"
require "../src/invidious/exceptions"
require "../src/invidious/helpers/macros"
require "../src/invidious/helpers/errors"
require "../src/invidious/helpers/logger"
require "../src/invidious/helpers/webvtt"
require "../src/invidious/helpers/handlers"
require "../src/invidious/http_server/utils"
require "../src/invidious/videos/caption"
require "../src/invidious/videos/music"
require "../src/invidious/videos/storyboard"
require "../src/invidious/videos/formats"
require "../src/invidious/videos"
require "../src/invidious/jsonify/api_v1/common"
require "../src/invidious/jsonify/api_v1/video_json"
require "../src/invidious/jsonify/api_v1/video_metadata"
require "../src/invidious/routes/api/v1/videos"

alias IV = Invidious
HOST_URL = "https://invidious.test"
LOGGER   = Invidious::LogHandler.new(STDOUT, LogLevel::Error, use_color: false)

record Preferences, locale : String = "en-US"
add_context_storage_type(Preferences)

# Original-title enrichment has its own coverage; preserve response bodies here.
module Invidious::OriginalTitles
  def self.read_request?(env)
    false
  end

  def self.valid_query?(env)
    true
  end

  def self.response(env, body)
    body
  end
end

get "/api/v1/videos/:id" do |env|
  Invidious::Routes::API::V1::Videos.videos(env)
end

get "/api/v1/storyboards/:id" do |env|
  Invidious::Routes::API::V1::Videos.storyboards(env)
end

error 404 do
  "HTML not found"
end

error 500 do
  "HTML server error"
end

class VideoFixtureExceptionHandler < Kemal::ExceptionHandler
  # Exercise the production error renderer without instantiating unrelated
  # authentication middleware through HTTP::Handler's shared next-handler union.
  def render_error(context, exception)
    call_exception_with_status_code(context, exception, context.response.status_code)
  end
end

# Translation and optional caches are external to these route/parser contracts.
module I18n
  enum NumberFormatting
    Short
  end

  def self.translate(locale, text, *args)
    text
  end

  def self.translate_count(locale, key, value, format)
    value.to_s
  end
end

def recode_date(time, locale)
  "fixture date"
end

module Invidious::Database::ChannelAvatars
  def self.select(ids)
    {} of String => String
  end

  def self.observe(urls)
    true
  end
end

module Invidious::Database::Videos
  def self.select_view_counts(ids)
    {} of String => Invidious::Videos::ViewCounts::Count
  end
end

class VideoFixture
  class_property info = JSON.parse(%({"title":"Post-live recording","lengthSeconds":9914,"views":35000,"viewCountPrecision":"exact","genreUcid":"","isPostLiveDvr":true,"music":[]})).as_h
  class_property checks = 0
end

def get_video(id, refresh = true, region = nil, force_refresh = false)
  raise NotFoundException.new("Video not found") if id == "missingvid1"
  Video.new({id: id, info: VideoFixture.info, updated: Time.utc})
end

def check(value, message)
  raise message unless value
  VideoFixture.checks += 1
end

def video_request(storyboards = false, query = "", id = "testvideo01")
  path = storyboards ? "/api/v1/storyboards/#{id}" : "/api/v1/videos/#{id}"
  routed_request("#{path}?#{query}")
end

def routed_request(path)
  output = IO::Memory.new
  env = HTTP::Server::Context.new(HTTP::Request.new("GET", path), HTTP::Server::Response.new(output))
  env.set "preferences", Preferences.new
  begin
    Kemal::RouteHandler::INSTANCE.call(env)
  rescue ex : Kemal::Exceptions::CustomException
    VideoFixtureExceptionHandler.new.render_error(env, ex)
  end
  env.response.close unless env.response.closed?
  response = HTTP::Client::Response.from_io(IO::Memory.new(output.to_s))
  {response.status_code, response.headers, response.body}
end

def check_unavailable_storyboards(label)
  check(get_video("testvideo01").storyboards.empty?, "#{label}: accessor should return no previews")
  {"local=true", "local=false"}.each do |query|
    status, headers, body = video_request(query: query)
    value = JSON.parse(body)
    check(status == 200 && headers["Content-Type"] == "application/json", "#{label}: video response failed")
    check(value["videoId"] == "testvideo01" && value["storyboards"].as_a.empty?, "#{label}: video identity/previews changed")
    check(value["dashUrl"] == "#{HOST_URL}/api/manifest/dash/id/testvideo01", "#{label}: playable URL was lost")
  end
  status, _, body = video_request(storyboards: true)
  check(status == 200 && JSON.parse(body)["storyboards"].as_a.empty?, "#{label}: storyboard listing failed")
  check(video_request(storyboards: true, query: "width=160")[0] == 404, "#{label}: unavailable preview should be 404")
end

check_unavailable_storyboards("missing field")
[%q(null), %q("{}"), %q([]), %q(17), %q(true), %q({}),
 %q({"playerLiveStoryboardSpecRenderer":"bad","playerStoryboardSpecRenderer":null}),
 %q({"playerLiveStoryboardSpecRenderer":{"spec":42},"playerStoryboardSpecRenderer":{"spec":[]}}),
 %q({"playerLiveStoryboardSpecRenderer":{"spec":""},"playerStoryboardSpecRenderer":{"spec":""}})].each do |body|
  VideoFixture.info["storyboards"] = JSON.parse(body)
  check_unavailable_storyboards(body)
end

vod = "https://i.ytimg.com/sb/testvideo01/storyboard3_L$L/$N.jpg?sqp=fixture|160#90#120#5#5#1000#M$M#signature"
VideoFixture.info["storyboards"] = JSON.parse({playerLiveStoryboardSpecRenderer: "bad", playerStoryboardSpecRenderer: {spec: vod}}.to_json)
preview = get_video("testvideo01").storyboards.first
check(preview.width == 160 && preview.height == 90 && preview.images_count == 5 && preview.interval == 1000, "Recording preview geometry changed")
check(preview.url.path == "/sb/testvideo01/storyboard3_L0/M$M.jpg" && preview.url.query_params["sigh"] == "signature", "Recording template/signature changed")
status, _, body = video_request(storyboards: true, query: "width=160")
check(status == 200 && body.starts_with?("WEBVTT") && body.includes?("#xywh=0,0,158,90"), "Recording preview VTT failed (#{status}, #{body[0, 350].inspect})")

VideoFixture.info["storyboards"] = JSON.parse({playerLiveStoryboardSpecRenderer: {spec: "https://i.ytimg.com/sb/testvideo01/live.jpg#signature"}}.to_json)
preview = get_video("testvideo01").storyboards.first
check(preview.width == 106 && preview.height == 60 && preview.count == -1 && preview.interval == 5000, "Live preview geometry changed")
status, _, body = video_request
check(status == 200 && JSON.parse(body)["storyboards"].as_a.size == 1, "Valid live previews disappeared from video metadata")

# A separate serialization fault must produce a nonempty, non-success JSON error.
VideoFixture.info["music"] = JSON::Any.new("invalid music metadata")
status, headers, body = video_request
check(status == 500 && headers["Content-Type"] == "application/json" && !JSON.parse(body)["error"].as_s.empty?, "Serialization failure escaped the JSON error boundary")
status, _, body = video_request(id: "missingvid1")
check(status == 404 && JSON.parse(body)["error"] == "Video not found", "Missing video no longer returns 404")
puts "#{VideoFixture.checks} video metadata/storyboard route checks passed"

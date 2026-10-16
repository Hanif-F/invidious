# Isolated production-route checks. Upstream transports and video metadata are
# synthetic; no PostgreSQL, real accounts, YouTube or application startup is used.
require "kemal"
require "xml"
require "../src/invidious/helpers/webvtt"
require "../src/invidious/videos/caption"

VTT = "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nFixture caption\n"

class CaptionFixtureConfig
  property invidious_companion = [1]
  property use_innertube_for_captions = false
end

class CaptionFixtureTransport
  property body = VTT
  property status = 200
  getter paths = [] of String

  def get(path : String)
    @paths << path
    HTTP::Client::Response.new(@status, body: @body)
  end
end

record CaptionFixtureCompanion, private_url : URI
record CaptionFixtureWrapper, client : CaptionFixtureTransport, companion : CaptionFixtureCompanion do
  def get(path : String)
    client.get(path)
  end
end

class CaptionFixturePool
  getter transport = CaptionFixtureTransport.new

  def client(&)
    yield CaptionFixtureWrapper.new(@transport, CaptionFixtureCompanion.new(URI.parse("http://private.test/internal/companion")))
  end
end

CONFIG         = CaptionFixtureConfig.new
COMPANION_POOL = CaptionFixturePool.new
YT_POOL        = CaptionFixturePool.new

class NotFoundException < Exception; end

class InvalidVideoID < Exception; end

macro error_json(status, message)
  env.response.status_code = {{status}}
  {"error" => {{message}}.to_s}.to_json
end

macro haltf(env, status)
  {{env}}.response.status_code = {{status}}
  return ""
end

def validate_video_id(id)
  /\A[a-zA-Z0-9_-]{11}\z/.matches?(id)
end

def invidious_companion_encrypt(id)
  "signed-#{id}"
end

record CaptionFixtureVideo, captions : Array(Invidious::Videos::Captions::Metadata)

def get_video(id, region = nil)
  CaptionFixtureVideo.new([
    Invidious::Videos::Captions::Metadata.new("English", "en", "https://www.youtube.com/timedtext?lang=en", false),
    Invidious::Videos::Captions::Metadata.new("English (auto-generated)", "en", "https://www.youtube.com/timedtext?lang=en", true),
  ])
end

module YoutubeAPI
  def self.get_transcript(params)
    "fixture transcript"
  end
end

module Invidious::Videos
  struct Transcript
    def self.generate_param(id, language, automatic)
      id
    end

    def self.from_raw(data, language, automatic)
      new
    end

    def to_vtt
      VTT
    end
  end
end

require "../src/invidious/routes/api/v1/videos"

def check(value, message)
  raise message unless value
end

def caption_request(query)
  request = HTTP::Request.new("GET", "/api/v1/captions/abcdefghijk?#{query}")
  env = HTTP::Server::Context.new(request, HTTP::Server::Response.new(IO::Memory.new))
  env.params.url["id"] = "abcdefghijk"
  body = Invidious::Routes::API::V1::Videos.captions(env)
  {env.response.status_code, env.response.headers, body}
end

status, headers, body = caption_request("label=English&region=ID&title=Japanese+captions.vtt&check=untrusted")
check(status == 200 && body == VTT, "Companion caption route failed")
check(headers["Content-Type"].starts_with?("text/vtt"), "Caption content type changed")
check(headers["Content-Disposition"].includes?("Japanese+captions.vtt"), "Attachment filename was lost")
query = URI.parse(COMPANION_POOL.transport.paths.last).query_params
check(query["check"] == "signed-abcdefghijk" && query["label"] == "English" && query["region"] == "ID", "Companion selector/signing mismatch")
check(COMPANION_POOL.transport.paths.last.starts_with?("/internal/companion/api/v1/captions/"), "Public instead of private Companion path used")
check(YT_POOL.transport.paths.empty?, "Companion caption unexpectedly called legacy upstream")

caption_request("lang=en")
check(URI.parse(COMPANION_POOL.transport.paths.last).query_params["lang"] == "en", "Language selector lost")
status, _, body = caption_request("")
check(status == 200 && JSON.parse(body)["captions"].as_a.size == 2, "Caption listing shape changed")
check(caption_request("label=Missing")[0] == 404, "Missing caption selector should be 404")

COMPANION_POOL.transport.body = "WEBVTT\nKind: captions\nLanguage: en\n\n"
status, headers, _ = caption_request("lang=en")
check(status == 502 && headers["Content-Type"] == "application/json", "Empty upstream caption was treated as success")
COMPANION_POOL.transport.body = "<html>Blocked</html>"
check(caption_request("lang=en")[0] == 502, "Malformed caption was treated as success")
COMPANION_POOL.transport.status = 503
check(caption_request("lang=en")[0] == 503, "Companion disabled status was lost")

calls = COMPANION_POOL.transport.paths.size
check(caption_request("label=English&tlang=fr")[0] == 200, "Legacy translated caption failed")
check(COMPANION_POOL.transport.paths.size == calls, "Translation incorrectly sent to Companion")
check(URI.parse(YT_POOL.transport.paths.last).query_params["tlang"] == "fr", "Translation language lost")
CONFIG.invidious_companion.clear
check(caption_request("lang=en")[2] == VTT, "Legacy caption without Companion failed")
YT_POOL.transport.body = "<transcript><text start=\"0\" dur=\"3\">Automatic fixture</text></transcript>"
check(caption_request("label=English+%28auto-generated%29")[2].includes?("Automatic fixture"), "Legacy automatic caption conversion failed")
CONFIG.use_innertube_for_captions = true
check(caption_request("lang=en")[2] == VTT, "Configured transcript backend failed")
puts "Caption production route checks passed: Companion, selectors, filenames, listing, failures, translation and legacy backends."

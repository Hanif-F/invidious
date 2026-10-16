require "spec"
require "../src/invidious/videos/caption_delivery"

describe Invidious::Videos::CaptionDelivery do
  it "routes encoded selectors through the private base path with a fresh check" do
    params = URI::Params.parse("label=English+%28auto-generated%29&lang=en&region=ID&title=private.vtt&check=untrusted")
    path = Invidious::Videos::CaptionDelivery.companion_path("/private/companion/", "gzUjw3jNB88", params, "signed+/=")
    uri = URI.parse(path)
    uri.path.should eq("/private/companion/api/v1/captions/gzUjw3jNB88")
    uri.query_params["label"].should eq("English (auto-generated)")
    uri.query_params["lang"].should eq("en")
    uri.query_params["region"].should eq("ID")
    uri.query_params["check"].should eq("signed+/=")
    uri.query_params.has_key?("title").should be_false
  end

  it "accepts real timed cues, including rolling automatic captions, CRLF and cue identifiers" do
    {"WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n", "\uFEFFWEBVTT\r\n\r\nidentifier\r\n00:00:01.000 --> 00:00:02.500 align:start\r\n<c>日本語</c>\r\n"}.each do |body|
      Invidious::Videos::CaptionDelivery.response(200, body).should eq(body)
    end
  end

  it "rejects successful but empty or malformed upstream bodies" do
    {"", "WEBVTT\nKind: captions\nLanguage: en\n\n", "<html>blocked</html>",
     "WEBVTT\n\n00:00.000 --> 00:02.000\n \n", "WEBVTT\n\n00:60.000 --> 00:61.000\nBad\n",
     "WEBVTT\n\n00:02.000 --> 00:01.000\nReversed\n"}.each do |body|
      expect_raises(Invidious::Videos::CaptionDelivery::UpstreamError) { Invidious::Videos::CaptionDelivery.response(200, body) }
    end
  end

  it "preserves missing and disabled tracks and reports other upstream failures as bad gateway" do
    {404 => 404, 503 => 503, 403 => 502, 429 => 502, 500 => 502}.each do |upstream, status|
      error = expect_raises(Invidious::Videos::CaptionDelivery::UpstreamError) { Invidious::Videos::CaptionDelivery.response(upstream, "WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n") }
      error.status.should eq(status)
    end
  end

  it "keeps Unicode attachment names safe in response headers" do
    header = Invidious::Videos::CaptionDelivery.attachment("日本語 \"track\"\r\n.vtt")
    header.should contain("filename*=UTF-8''")
    header.should_not contain('\r')
    header.should_not contain('\n')
    header.should contain("%E6%97%A5")
  end
end

require "spec"
require "../../src/invidious/http_server/utils"

describe Invidious::HttpServer::Utils do
  it "accepts only complete media hostnames" do
    %w(rr1---sn-a5mekn7z.googlevideo.com r1.c.youtube.com).each do |host|
      Invidious::HttpServer::Utils.video_host?(host).should be_true
    end
    ["", "googlevideo.com", "r1.googlevideo.com.attacker.invalid", "r1.googlevideo.com@127.0.0.1", "127.0.0.1/r1.googlevideo.com", "r1.googlevideo.com:443", "r1.googlevideo.com\n", "r1.googlevideo.com?x=1", "r1.googlevideo.com#fragment", "https://r1.googlevideo.com", "r1%2egooglevideo.com", "-r.googlevideo.com"].each do |host|
      Invidious::HttpServer::Utils.video_host?(host).should be_false
    end
  end

  it "validates the scheme, authority and credentials of every redirect" do
    {"https://r1.googlevideo.com/videoplayback?x=1", "https://r1.googlevideo.com:443/videoplayback"}.each do |url|
      Invidious::HttpServer::Utils.video_uri?(URI.parse(url)).should be_true
    end
    {"http://r1.googlevideo.com/a", "https://r1.googlevideo.com:8443/a", "https://user@r1.googlevideo.com/a", "https://user:pass@r1.googlevideo.com/a", "https://127.0.0.1/a", "https://r1.googlevideo.com.evil.test/a", "https://r1.googlevideo.com/a#fragment", "/videoplayback"}.each do |url|
      Invidious::HttpServer::Utils.video_uri?(URI.parse(url)).should be_false
    end
    base = URI.parse("https://r1.googlevideo.com")
    Invidious::HttpServer::Utils.video_uri?(base.resolve("/videoplayback?x=1")).should be_true
    Invidious::HttpServer::Utils.video_uri?(base.resolve("//evil.test/videoplayback")).should be_false
  end
end

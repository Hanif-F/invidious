require "spectator"
require "../../../src/invidious/jsonify/api_v1/channel_avatars"

Spectator.describe Invidious::JSONify::APIv1::ChannelAvatars do
  it "uses one unique-ID lookup across top-level and nested records, preserving supplied URLs" do
    value = JSON.parse(%({"authorId":"UCdirect","authorThumbnails":[{"url":"https://yt3.ggpht.com/direct=s176"}],"videos":[{"authorId":"UCcached","videoId":"a","indexId":"A"},{"authorId":"UCcached","videoId":"a","indexId":"B"}],"recommendedVideos":[{"authorId":"UCmissing"}],"entries":[{"channel_id":"UChistory"}]}))
    reads = [] of Array(String)
    learned = {} of String => String
    lookup = ->(ids : Array(String)) { reads << ids; {"UCcached" => "/ggpht/cached=s88", "UChistory" => "/ggpht/history=s88"} }
    learn = ->(urls : Hash(String, String)) { learned.merge!(urls); true }
    result = described_class.enrich(value, lookup, learn)
    expect(reads.map(&.sort)).to eq([%w(UCcached UCmissing UChistory).sort])
    expect(learned).to eq({"UCdirect" => "/ggpht/direct=s88"})
    expect(result["authorThumbnails"][0]["url"].as_s).to eq("https://yt3.ggpht.com/direct=s176")
    expect(result["videos"][0]["authorThumbnails"][0]["url"].as_s).to eq("/ggpht/cached=s88")
    expect(result["videos"][1]["indexId"].as_s).to eq("B")
    expect(result["entries"][0]["authorThumbnails"][0]["url"].as_s).to eq("/ggpht/history=s88")
    expect(result["recommendedVideos"][0]["authorThumbnails"]?).to be_nil
  end

  it "shares a supplied identity with other rows without querying the cache" do
    value = JSON.parse(%([{"authorId":"UCsame","authorThumbnail":"//yt3.googleusercontent.com/direct=s48"},{"authorId":"UCsame"}]))
    reads = 0
    lookup = ->(ids : Array(String)) { reads += 1; {} of String => String }
    learn = ->(urls : Hash(String, String)) { true }
    result = described_class.enrich(value, lookup, learn)
    expect(reads).to eq(0)
    expect(result[1]["authorThumbnails"][0]["url"].as_s).to eq("/ggpht/direct=s88")
  end

  it "isolates read and write failures without losing existing images or fetching metadata" do
    value = JSON.parse(%([{"authorId":"UCdirect","authorThumbnails":[{"url":"https://yt3.ggpht.com/direct=s48"}]},{"authorId":"UCmissing"}]))
    reads = 0
    writes = 0
    lookup = ->(ids : Array(String)) { reads += 1; raise "cache unavailable"; {} of String => String }
    learn = ->(urls : Hash(String, String)) { writes += 1; raise "cache unavailable"; false }
    result = described_class.enrich(value, lookup, learn)
    expect(reads).to eq(1)
    expect(writes).to eq(1)
    expect(result[0]["authorThumbnails"][0]["url"].as_s).to eq("https://yt3.ggpht.com/direct=s48")
    expect(result[1]["authorThumbnails"]?).to be_nil
  end

  it "ignores malformed images, unknown identities and unrelated JSON structures" do
    value = JSON.parse(%({"videos":[{"authorId":"UCbad","authorThumbnails":[42,null,{"url":"https://evil.test/image"}]}],"adaptiveFormats":[{"authorId":"not-a-channel"}],"captions":[],"continuation":"opaque+/="}))
    reads = [] of Array(String)
    lookup = ->(ids : Array(String)) { reads << ids; {"UCbad" => "https://evil.test/cache"} }
    learn = ->(urls : Hash(String, String)) { raise "No usable images to learn"; false }
    result = described_class.enrich(value, lookup, learn)
    expect(reads).to eq([%w(UCbad)])
    expect(result["videos"][0]["authorThumbnails"].as_a.size).to eq(3)
    expect(result["continuation"].as_s).to eq("opaque+/=")
    expect(result["adaptiveFormats"][0]["authorThumbnails"]?).to be_nil
  end
end

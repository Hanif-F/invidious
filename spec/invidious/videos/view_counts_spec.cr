require "../../parsers_helper"
require "../../spec_helper"
require "../../../src/invidious/jsonify/api_v1/video_metadata"
require "../../../src/invidious/database/videos"

private alias ViewCounts = Invidious::Videos::ViewCounts
private alias ViewCount = Invidious::Videos::ViewCounts::Count

# Only a read interface is available; a write or metadata-fetch call cannot pass.
private class ViewCountReadOnlyDB
  alias Row = {String, String?, Int64?, Bool?, Time?, Int32}
  getter requests = [] of Array(String)
  property fail = false

  def initialize(@rows : Array(Row) = [] of Row)
  end

  def query_all(sql, ids, *, as types)
    @requests << ids
    raise "cache offline" if fail
    @rows
  end
end

Spectator.describe Invidious::Videos::ViewCounts do
  it "uses precise accessibility counts without counting titles or upload ages" do
    renderer = JSON.parse(%({"viewCountText":{"simpleText":"1.2M views","accessibility":{"accessibilityData":{"label":"2024 retrospective, 1,234,567 views, 2 years ago"}}}}))
    expect(described_class.from_renderer(renderer)).to eq(ViewCount.new(1_234_567_i64, "exact"))
    expect(described_class.from_renderer(JSON.parse(%({"accessibility":{"accessibilityData":{"label":"2024 retrospective, 2 years ago, 12 minutes"}}})))).to be_nil
    renderer = JSON.parse(%({"viewCountText":{"simpleText":"1.2M views"},"accessibility":{"accessibilityData":{"label":"My first 100 views, 1,234,567 views, 2 years ago"}}}))
    expect(described_class.from_renderer(renderer)).to eq(ViewCount.new(1_200_000_i64, "approximate"))
  end

  it "falls back to short counts and combined panel metadata" do
    renderer = JSON.parse(%({"shortViewCountText":{"runs":[{"text":"7.5K"},{"text":" watching"}]}}))
    expect(described_class.from_renderer(renderer)).to eq(ViewCount.new(7_500_i64, "approximate", "watching"))
    renderer = JSON.parse(%({"videoInfo":{"runs":[{"text":"Creator"},{"text":" • 23 views • 2 days ago"}]}}))
    expect(described_class.from_renderer(renderer)).to eq(ViewCount.new(23_i64, "exact"))
    expect(described_class.from_renderer(JSON.parse(%({"viewCount":12,"isLive":true})))).to eq(ViewCount.new(12_i64, "exact", "watching"))
  end

  it "preserves real zero and keeps missing, malformed and negative counts unknown" do
    ["No views", "0 views"].each do |text|
      expect(described_class.from_renderer(JSON.parse({viewCountText: {simpleText: text}}.to_json))).to eq(ViewCount.new(0_i64, "exact"))
    end
    [%(null), %({}), %({"viewCountText":42}), %({"viewCountText":{"simpleText":"-1 views"}}), %({"viewCountText":{"simpleText":"999999999999999999999T views"}})].each do |body|
      expect(described_class.from_renderer(JSON.parse(body))).to be_nil
    end
  end

  it "keeps valid counts when unrelated optional metadata is malformed" do
    renderer = JSON.parse(%({"viewCountText":{"simpleText":"42 views"},"metadata":{"lockupMetadataViewModel":42}}))
    expect(described_class.from_renderer(renderer)).to eq(ViewCount.new(42_i64, "exact"))
  end

  it "extracts modern playlist rows while ignoring linked author names" do
    item = JSON.parse(File.read("#{__DIR__}/../frontend/fixtures/avatar_lockups.json")).as_a.first
    expect(described_class.from_renderer(item["lockupViewModel"])).to eq(ViewCount.new(106_000_000_i64, "approximate"))
    rows = item.dig("lockupViewModel", "metadata", "lockupMetadataViewModel", "metadata", "contentMetadataViewModel", "metadataRows").as_a
    rows.pop
    rows.first.dig("metadataParts", 0, "text").as_h["content"] = JSON::Any.new("2024 views")
    expect(described_class.from_renderer(item["lockupViewModel"])).to be_nil
  end

  it "prefers cumulative views over concurrent viewers when both are supplied" do
    renderer = JSON.parse(%({"viewCountText":{"simpleText":"12 watching"},"shortViewCountText":{"simpleText":"1.2K views"}}))
    expect(described_class.from_renderer(renderer)).to eq(ViewCount.new(1_200_i64, "approximate"))
  end

  it "does not interpret a missing lockup count as an exact zero" do
    parts = JSON.parse(%([{"text":{"content":"2 years ago"}}])).as_a
    expect(HelperExtractors.get_lockup_short_view_count(parts)).to eq("")
    expect(HelperExtractors.get_short_view_count(JSON.parse("{}"))).to eq("")
  end

  it "deduplicates cache misses and preserves supplied data including zero" do
    supplied = {"one" => ViewCount.new(0_i64, "exact"), "two" => nil, "three" => nil} of String => ViewCount?
    reads = [] of Array(String)
    result = described_class.resolve(supplied) do |ids|
      reads << ids
      {"one" => ViewCount.new(123_i64, "exact"), "two" => ViewCount.new(42_i64, "exact")}
    end
    expect(reads).to eq([%w(two three)])
    expect(result["one"].try(&.value)).to eq(0)
    expect(result["two"].try(&.value)).to eq(42)
    expect(result["three"]).to be_nil
  end

  it "skips the lookup when counts are supplied and tolerates cache outages" do
    supplied = {"known" => ViewCount.new(0_i64, "exact")} of String => ViewCount?
    expect(described_class.resolve(supplied) { |_ids| raise "unnecessary read"; {} of String => ViewCount }).to eq(supplied)
    missing = {"missing" => nil} of String => ViewCount?
    expect(described_class.resolve(missing) { |_ids| raise "database unavailable"; {} of String => ViewCount }).to eq(missing)
  end

  it "recognizes existing unknown markers and ambiguous legacy live counts" do
    expect(described_class.from_info(JSON.parse(%({"views":0,"viewCountPrecision":"unknown"})).as_h)).to be_nil
    expect(described_class.from_info(JSON.parse(%({"views":0,"viewCountPrecision":"exact","viewCountType":"views"})).as_h)).to eq(ViewCount.new(0_i64, "exact"))
    expect(described_class.from_info(JSON.parse(%({"views":42,"videoType":"Livestream"})).as_h)).to be_nil
    expect(described_class.from_info(JSON.parse(%({"views":42,"viewCountPrecision":"exact","viewCountType":"watching"})).as_h)).to eq(ViewCount.new(42_i64, "exact", "watching"))
  end

  it "keeps unknown related-video counts unknown while retaining string cache fields" do
    expect(described_class.from_related({"short_view_count" => "0"})).to be_nil
    expect(described_class.from_related({"short_view_count" => "0", "view_count" => "0", "view_count_precision" => "exact", "view_count_type" => "views"})).to eq(ViewCount.new(0_i64, "exact"))
  end
end

Spectator.describe "Watch-page view count types" do
  it "uses concurrent viewers instead of a live player zero, and a total when available" do
    data = load_mock("video/regular_mrbeast.player").merge!(load_mock("video/regular_mrbeast.next"))
    contents = data.dig("contents", "twoColumnWatchNextResults", "results", "results", "contents").as_a
    renderer = contents.find(&.["videoPrimaryInfoRenderer"]?).not_nil!.dig("videoPrimaryInfoRenderer", "viewCount", "videoViewCountRenderer")
    renderer.as_h["viewCount"] = JSON.parse(%({"runs":[{"text":"12"},{"text":" watching"}]}))
    renderer.as_h["isLive"] = JSON::Any.new(true)
    data["videoDetails"].as_h["viewCount"] = JSON::Any.new("0")
    info = Invidious::Videos::Parser.parse_video_info("2isYuQZMbdU", data)
    expect(info["views"].as_i64).to eq(12)
    expect(info["viewCountType"].as_s).to eq("watching")
    data["videoDetails"].as_h["viewCount"] = JSON::Any.new("1234")
    info = Invidious::Videos::Parser.parse_video_info("2isYuQZMbdU", data)
    expect(info["views"].as_i64).to eq(1234)
    expect(info["viewCountType"].as_s).to eq("views")
  end
end

Spectator.describe Invidious::Database::Videos do
  it "reads existing caches once, skips invalid observations, and never writes" do
    now = Time.utc
    rows = [
      {"one", %({"views":0,"viewCountPrecision":"unknown"}), nil, false, now, 0},
      {"one", nil, 23_i64, false, now - 1.minute, 1},
      {"two", %({"views":0,"viewCountPrecision":"exact","viewCountType":"views"}), nil, false, now, 0},
      {"two", nil, 42_i64, false, now - 1.minute, 1},
      {"broken", "malformed", nil, false, now, 0},
      {"broken", nil, 5_i64, false, now - 1.minute, 1},
      {"live", nil, 50_i64, true, now, 1},
    ] of ViewCountReadOnlyDB::Row
    db = ViewCountReadOnlyDB.new(rows)
    result = described_class.select_view_counts(%w(one two one broken live missing), db)
    expect(db.requests).to eq([%w(one two broken live missing)])
    expect(result["one"].value).to eq(23)
    expect(result["two"].value).to eq(0)
    expect(result["broken"].value).to eq(5)
    expect(result["live"]?).to be_nil
    expect(result["missing"]?).to be_nil
    expect(described_class.select_view_counts([] of String, db)).to be_empty
    expect(db.requests.size).to eq(1)
    db.fail = true
    expect(described_class.select_view_counts(["one"], db)).to be_empty
    expect(db.requests.size).to eq(2)
  end
end

Spectator.describe Invidious::JSONify::APIv1::VideoMetadata do
  it "enriches video records in one batch without changing playlist aggregate views or bare history IDs" do
    value = JSON.parse(%({"playlistId":"PLtest","viewCount":9000,"videos":[{"videoId":"one","viewCount":0,"viewCountPrecision":"unknown"},{"videoId":"one"},{"videoId":"two"}],"entries":[{"video_id":"history"}],"clips":[{"clipId":"clip","videoId":"source","video":{"videoId":"source"}}]}))
    reads = [] of Array(String)
    result = described_class.enrich(value) do |ids|
      reads << ids
      {"one" => ViewCount.new(123_i64, "exact"), "history" => ViewCount.new(0_i64, "exact"), "source" => ViewCount.new(7_i64, "exact")}
    end
    expect(reads).to eq([%w(one two history source)])
    expect(result["viewCount"].as_i).to eq(9000)
    expect(result["videos"][0]["viewCount"].as_i).to eq(123)
    expect(result["videos"][1]["viewCountType"].as_s).to eq("views")
    expect(result["videos"][2]["viewCount"]?).to be_nil
    expect(result["entries"][0]["viewCount"].as_i).to eq(0)
    expect(result["clips"][0]["viewCount"]?).to be_nil
    expect(result["clips"][0]["video"]["viewCount"].as_i).to eq(7)
    ids = JSON.parse(%(["one","two"]))
    expect(described_class.enrich(ids) { |_ids| raise "ID-only history must stay unchanged"; {} of String => ViewCount }).to eq(ids)
  end

  it "keeps supplied watching counts and explicit unknown markers on cache failure" do
    value = JSON.parse(%([{"videoId":"live","viewCount":12,"viewCountPrecision":"exact","viewCountType":"watching"},{"videoId":"missing","viewCount":0,"viewCountPrecision":"unknown","viewCountText":""}]))
    result = described_class.enrich(value) do |ids|
      expect(ids).to eq(["missing"])
      raise "cache offline"
      {} of String => ViewCount
    end
    expect(result[0]["viewCountType"].as_s).to eq("watching")
    expect(result[1]["viewCountPrecision"].as_s).to eq("unknown")
    expect(result[1]["viewCountType"]?).to be_nil
  end
end

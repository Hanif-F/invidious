require "../../parsers_helper"

private def metadata_short_item(id = "abcdefghijk")
  JSON.parse(%({"richItemRenderer":{"content":{"shortsLockupViewModel":{"onTap":{"innertubeCommand":{"reelWatchEndpoint":{"videoId":"#{id}"}}},"overlayMetadata":{"primaryText":{"content":"Short"},"secondaryText":{"content":"5.6M views"}}}}}}))
end

private def metadata_short(id = "abcdefghijk")
  parse_item(metadata_short_item(id), "Creator", "UCcreator").as(SearchVideo)
end

Spectator.describe Invidious::Videos::Metadata do
  it "preserves exact integers while marking scaled source text as approximate" do
    expect(described_class.count("5,600,001 views")).to eq({5_600_001_i64, "exact"})
    expect(described_class.count("Like this video along with 6,870,691 other people")).to eq({6_870_691_i64, "exact"})
    expect(described_class.count("5.6M views")).to eq({5_600_000_i64, "approximate"})
    expect(described_class.count("1.2K likes")).to eq({1_200_i64, "approximate"})
    expect(described_class.count("No views")).to eq({0_i64, "exact"})
    expect(described_class.count("0 likes")).to eq({0_i64, "exact"})
    expect(described_class.count("9223372036854775807 views")).to eq({Int64::MAX, "exact"})
    [nil, "", "-1 likes", "1.5 likes", "1 of 2", "999999999999999999999T views"].each do |value|
      expect(described_class.count(value)).to eq({nil, "unknown"})
    end
  end

  it "does not fabricate a Shorts publication date or one-minute duration" do
    video = metadata_short
    expect(video.published.to_unix).to eq(0)
    expect(video.length_seconds).to eq(0)
    expect(video.views).to eq(5_600_000_i64)
    expect(video.view_count_precision).to eq("approximate")
  end

  it "uses real date and duration fields when the existing Shorts response supplies them" do
    item = metadata_short_item
    contents = item.dig("richItemRenderer", "content", "shortsLockupViewModel")
    contents.as_h["lengthSeconds"] = JSON::Any.new(42_i64)
    contents.dig("onTap", "innertubeCommand", "reelWatchEndpoint").as_h["overlay"] = JSON.parse(%({"reelPlayerOverlayRenderer":{"reelPlayerHeaderSupportedRenderers":{"reelPlayerHeaderRenderer":{"timestampText":{"simpleText":"Apr 23, 2024"}}}}}))
    video = parse_item(item).as(SearchVideo)
    expect(video.published).to eq(Time.utc(2024, 4, 23))
    expect(video.length_seconds).to eq(42)
    contents.as_h["lengthSeconds"] = JSON::Any.new(Int64::MAX)
    contents.dig("overlayMetadata").as_h.delete("secondaryText")
    video = parse_item(item).as(SearchVideo)
    expect(video.length_seconds).to eq(0)
    expect(video.view_count_precision).to eq("unknown")
  end

  it "bundles cached source dates and durations in one unique-ID lookup" do
    items = [metadata_short, metadata_short, metadata_short("missingdate")] of SearchItem
    reads = [] of Array(String)
    result = described_class.enrich_shorts(items) do |ids|
      reads << ids
      {"abcdefghijk" => JSON.parse(%({"published":"2024-04-23T00:00:00Z","publishedIsKnown":true,"lengthSeconds":42}))}
    end
    expect(reads).to eq([%w(abcdefghijk missingdate)])
    expect(result.size).to eq(3)
    expect(result.first.as(SearchVideo).published).to eq(Time.utc(2024, 4, 23))
    expect(result.first.as(SearchVideo).length_seconds).to eq(42)
    expect(result.last.as(SearchVideo).published.to_unix).to eq(0)
  end

  it "keeps supplied metadata and skips a cache lookup when nothing is missing" do
    video = metadata_short
    video.published = Time.utc(2024, 4, 23); video.length_seconds = 37
    result = described_class.enrich_shorts([video] of SearchItem) do |ids|
      raise "No cache lookup should be necessary"
      {} of String => JSON::Any
    end
    expect(result.first.as(SearchVideo).length_seconds).to eq(37)
    expect(result.first.as(SearchVideo).published).to eq(Time.utc(2024, 4, 23))
  end

  it "does not trust legacy inferred dates or malformed cached fields" do
    [%(null), %({"published":"2024-04-23T00:00:00Z"}),
     %({"published":"broken","publishedIsKnown":true,"lengthSeconds":-1}),
     %({"published":"1970-01-01T00:00:00Z","publishedIsKnown":true,"lengthSeconds":9999999999}),
     %({"published":"9999-01-01T00:00:00Z","publishedIsKnown":true,"lengthSeconds":"42"})].each do |body|
      result = described_class.enrich_shorts([metadata_short] of SearchItem) { |ids| {"abcdefghijk" => JSON.parse(body)} }
      expect(result.first.as(SearchVideo).published.to_unix).to eq(0)
      expect(result.first.as(SearchVideo).length_seconds).to eq(0)
    end
  end

  it "keeps the page available when the optional cache fails" do
    items = [metadata_short] of SearchItem
    reads = 0
    result = described_class.enrich_shorts(items) do |ids|
      reads += 1
      raise "cache unavailable"
      {} of String => JSON::Any
    end
    expect(reads).to eq(1); expect(result).to eq(items)
  end

  it "keeps publication dates separate from scheduled timestamps" do
    expect(described_class.publication("1970-01-01")).to be_nil
    expect(described_class.publication("9999-01-01")).to be_nil
    expect(described_class.publication("malformed")).to be_nil
    expect(described_class.publication("2024-04-23T19:00:00Z")).to eq(Time.utc(2024, 4, 23))
    result = described_class.enrich_shorts([metadata_short] of SearchItem) do |ids|
      {"abcdefghijk" => JSON.parse(%({"publishedIsKnown":true,"sourcePublished":"2024-04-23T00:00:00Z","published":"9999-01-01T00:00:00Z"}))}
    end
    expect(result.first.as(SearchVideo).published).to eq(Time.utc(2024, 4, 23))
  end
end

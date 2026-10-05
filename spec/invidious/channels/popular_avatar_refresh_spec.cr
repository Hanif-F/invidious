require "../../parsers_helper"

def popular_avatar_response(name)
  JSON.parse(File.read("spec/invidious/channels/fixtures/popular_avatars/#{name}.json"))
end

Spectator.describe Invidious::ChannelAvatars do
  it "learns real metadata avatars absent from both channel video listings" do
    {"ltt" => "UCXuqSBlHAE6Xw-yeJA0Tunw", "mrbeast" => "UCX6OQ3DkcsbYNE6H8uQQuVA"}.each do |name, id|
      expect(described_class.from_channel_metadata(popular_avatar_response("baseline_#{name}"), id)).to be_empty
      expected = popular_avatar_response("expected_avatars")[id].as_s
      expect(described_class.from_channel_metadata(popular_avatar_response("candidate_#{name}"), id)).to eq({id => expected})
    end
  end

  it "requires an explicit valid metadata ID matching the requested channel" do
    {nil, "", "UCshort", "UCXuqSBlHAE6Xw-yeJA0Tunw", 42, true}.each do |id|
      response = JSON.parse({metadata: {channelMetadataRenderer: {externalId: id, avatar: {thumbnails: [{url: "https://yt3.ggpht.com/avatar"}]}}}}.to_json)
      expect(described_class.from_channel_metadata(response, "UCX6OQ3DkcsbYNE6H8uQQuVA")).to be_empty
    end
    {"", "UCshort", "UCX6OQ3DkcsbYNE6H8uQQuV!", "UCX6OQ3DkcsbYNE6H8uQQuVA\n"}.each do |id|
      response = JSON.parse({metadata: {channelMetadataRenderer: {externalId: id, avatar: {thumbnails: [{url: "https://yt3.ggpht.com/avatar"}]}}}}.to_json)
      expect(described_class.from_channel_metadata(response, id)).to be_empty
    end
  end

  it "skips missing or malformed optional metadata and images without changing the response" do
    {"null", "[]", "42", "{}", %({"metadata":42}), %({"metadata":{"channelMetadataRenderer":[]}}),
     %({"metadata":{"channelMetadataRenderer":{"externalId":"UCX6OQ3DkcsbYNE6H8uQQuVA","avatar":42}}}),
     %({"metadata":{"channelMetadataRenderer":{"externalId":"UCX6OQ3DkcsbYNE6H8uQQuVA","avatar":{"thumbnails":{}}}}}),
     %({"metadata":{"channelMetadataRenderer":{"externalId":"UCX6OQ3DkcsbYNE6H8uQQuVA","avatar":{"thumbnails":[null,42,{}, {"url":false}]}}}})}.each do |raw|
      response = JSON.parse(raw)
      before = response.to_json
      expect(described_class.from_channel_metadata(response, "UCX6OQ3DkcsbYNE6H8uQQuVA")).to be_empty
      expect(response.to_json).to eq(before)
    end
  end

  it "uses the last valid thumbnail and existing proxy normalization" do
    response = JSON.parse(%({"metadata":{"channelMetadataRenderer":{"externalId":"UCX6OQ3DkcsbYNE6H8uQQuVA","avatar":{"thumbnails":[{"url":"https://yt3.ggpht.com/low=s48"},{"url":"//yt3.googleusercontent.com/high=s512"},{"url":"https://example.com/invalid"},null]}}}}))
    expect(described_class.from_channel_metadata(response, "UCX6OQ3DkcsbYNE6H8uQQuVA")).to eq({"UCX6OQ3DkcsbYNE6H8uQQuVA" => "/ggpht/high=s88"})
  end

  it "rejects unsupported image URLs and never substitutes enclosing identities or header images" do
    {"", "https://example.com/avatar", "https://yt3.ggpht.com/", "https://user@yt3.ggpht.com/avatar", "https://yt3.ggpht.com:443/avatar", "javascript:alert(1)"}.each do |url|
      response = JSON.parse({metadata: {channelMetadataRenderer: {externalId: "UCX6OQ3DkcsbYNE6H8uQQuVA", avatar: {thumbnails: [{url: url}]}}}, authorId: "UCX6OQ3DkcsbYNE6H8uQQuVA", header: {avatar: {thumbnails: [{url: "https://yt3.ggpht.com/other"}]}}}.to_json)
      expect(described_class.from_channel_metadata(response, "UCX6OQ3DkcsbYNE6H8uQQuVA")).to be_empty
    end
  end
end

Spectator.describe "Popular refresh request fixtures" do
  it "preserves both channels’ complete video order and parsed metadata" do
    {"ltt" => {"Linus Tech Tips", "UCXuqSBlHAE6Xw-yeJA0Tunw"}, "mrbeast" => {"MrBeast", "UCX6OQ3DkcsbYNE6H8uQQuVA"}}.each do |key, identity|
      baseline, old_cursor = extract_items(popular_avatar_response("baseline_#{key}").as_h, identity[0], identity[1])
      replacement, new_cursor = extract_items(popular_avatar_response("candidate_#{key}").as_h, identity[0], identity[1])
      old_videos = baseline.select(SearchVideo)
      new_videos = replacement.select(SearchVideo)
      expect(old_videos.size).to eq(30)
      expect(new_videos.map { |v| {v.id, v.title, v.author, v.ucid, v.length_seconds, v.members_only, v.author_verified, v.premiere_timestamp} }).to eq(old_videos.map { |v| {v.id, v.title, v.author, v.ucid, v.length_seconds, v.members_only, v.author_verified, v.premiere_timestamp} })
      # One live view count changed between requests; unavailable member counts remain unavailable.
      expect(new_videos.map { |v| v.views > 0 }).to eq(old_videos.map { |v| v.views > 0 })
      expect(new_videos.zip(old_videos).all? { |pair| (pair[0].published - pair[1].published).abs < 1.minute }).to be_true
      expect(old_cursor).to eq("fixture-next-page")
      expect(new_cursor).to eq("fixture-next-page")
      expect(Invidious::ChannelAvatars.from_items(new_videos)).to be_empty
      tab = popular_avatar_response("candidate_#{key}").dig("contents", "twoColumnBrowseResultsRenderer", "tabs", 0, "tabRenderer")
      expect(tab["title"].as_s).to eq("Videos")
      expect(tab["selected"].as_bool).to be_true
      chip = tab.dig("content", "richGridRenderer", "header", "chipBarViewModel", "chips", 0, "chipViewModel")
      expect(chip["text"].as_s).to eq("Latest")
      if chip["selected"]?
        expect(chip["selected"].as_bool).to be_true
      else
        latest = chip.dig("tapCommand", "innertubeCommand", "showSheetCommand", "panelLoadingStrategy", "inlineContent", "sheetViewModel", "content", "listViewModel", "listItems", 0, "listItemViewModel")
        expect(latest["isSelected"].as_bool).to be_true
      end
    end
  end

  it "parses the live continuation without duplicated or lost cards" do
    first, _ = extract_items(popular_avatar_response("candidate_ltt").as_h, "Linus Tech Tips", "UCXuqSBlHAE6Xw-yeJA0Tunw")
    next_items, continuation = extract_items(popular_avatar_response("continuation_ltt").as_h, "Linus Tech Tips", "UCXuqSBlHAE6Xw-yeJA0Tunw")
    next_videos = next_items.select(SearchVideo)
    expect(next_videos.size).to eq(30)
    expect(next_videos.map(&.id).uniq.size).to eq(30)
    expect(first.select(SearchVideo).map(&.id) & next_videos.map(&.id)).to be_empty
    expect(continuation).to eq("fixture-next-page")
    expect(next_videos.all? { |v| v.ucid == "UCXuqSBlHAE6Xw-yeJA0Tunw" }).to be_true
  end
end

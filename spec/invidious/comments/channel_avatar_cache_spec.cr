require "spectator"
require "../../../src/invidious/helpers/channel_avatars"

Spectator.describe Invidious::ChannelAvatars do
  it "collects direct modern and legacy authors without changing the response" do
    response = JSON.parse(%({"comments":[
      {"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":"https://yt3.googleusercontent.com/modern=s176-c-k"},
      {"authorId":"UCXuqSBlHAE6Xw-yeJA0Tunw","authorThumbnails":[{"url":"https://yt3.ggpht.com/low=s48-c-k"},{"url":"https://yt3.ggpht.com/high=s512-c-k"}]}
    ]}))
    original = response.to_json
    expect(described_class.from_comments(response)).to eq({
      "UCX6OQ3DkcsbYNE6H8uQQuVA" => "/ggpht/modern=s88-c-k",
      "UCXuqSBlHAE6Xw-yeJA0Tunw" => "/ggpht/high=s88-c-k",
    })
    expect(response.to_json).to eq(original)
  end

  it "uses the last valid supplied URL for each author in response order" do
    response = JSON.parse(%({"comments":[
      {"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":"https://yt3.ggpht.com/first=s48"},
      {"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnails":[{"url":"/ggpht/latest=s512"}]},
      {"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":"https://example.com/invalid"}
    ]}))
    expect(described_class.from_comments(response)).to eq({"UCX6OQ3DkcsbYNE6H8uQQuVA" => "/ggpht/latest=s88"})
  end

  it "prefers a valid modern image and falls back to valid legacy images" do
    response = JSON.parse(%({"comments":[
      {"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":"https://yt3.ggpht.com/modern=s48","authorThumbnails":[{"url":"/ggpht/legacy"}]},
      {"authorId":"UCXuqSBlHAE6Xw-yeJA0Tunw","authorThumbnail":42,"authorThumbnails":[null,42,{"url":"https://yt3.ggpht.com/valid=s176"},{"url":false},{"url":"https://example.com/unsupported"}]}
    ]}))
    expect(described_class.from_comments(response)).to eq({
      "UCX6OQ3DkcsbYNE6H8uQQuVA" => "/ggpht/modern=s88",
      "UCXuqSBlHAE6Xw-yeJA0Tunw" => "/ggpht/valid=s88",
    })
  end

  it "requires a complete explicit YouTube channel ID for each record" do
    {nil, "", "UC", "UCshort", "@MrBeast", "2isYuQZMbdU", "UCX6OQ3DkcsbYNE6H8uQQuV!", "UCX6OQ3DkcsbYNE6H8uQQuVAA", " UCX6OQ3DkcsbYNE6H8uQQuVA", "UCX6OQ3DkcsbYNE6H8uQQuVA\n"}.each do |id|
      response = JSON.parse({authorId: "UCX6OQ3DkcsbYNE6H8uQQuVA", comments: [{authorId: id, authorThumbnail: "https://yt3.ggpht.com/image"}]}.to_json)
      expect(described_class.from_comments(response)).to be_empty
    end
    {"42", "true", "{}", "[]"}.each do |id|
      response = JSON.parse(%({"comments":[{"authorId":#{id},"authorThumbnail":"https://yt3.ggpht.com/image"}]}))
      expect(described_class.from_comments(response)).to be_empty
    end
  end

  it "skips empty and malformed containers, records and images" do
    {"null", "42", "[]", "{}", %({"comments":null}), %({"comments":{}}), %({"comments":[]}),
     %({"comments":[null,42,true,[],{}, {"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":{},"authorThumbnails":"bad"}]})}.each do |raw|
      expect(described_class.from_comments(JSON.parse(raw))).to be_empty
    end
    {nil, "", "https://example.com/avatar", "https://yt3.ggpht.com/", "javascript:alert(1)", "https://user@yt3.ggpht.com/avatar", "https://yt3.ggpht.com:443/avatar"}.each do |url|
      response = JSON.parse({comments: [{authorId: "UCX6OQ3DkcsbYNE6H8uQQuVA", authorThumbnail: url}]}.to_json)
      expect(described_class.from_comments(response)).to be_empty
    end
  end

  it "ignores enclosing identities, hearts, sponsor icons, attachments and nested authors" do
    response = JSON.parse(%({"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":"https://yt3.ggpht.com/root","videoId":"2isYuQZMbdU","comments":[
      {"author":"MrBeast","authorUrl":"/channel/UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":"https://yt3.ggpht.com/unidentified"},
      {"authorId":"UCXuqSBlHAE6Xw-yeJA0Tunw","creatorHeart":{"creatorThumbnail":"https://yt3.ggpht.com/heart"},"sponsorIconUrl":"https://yt3.ggpht.com/sponsor","attachment":{"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":"https://yt3.ggpht.com/attachment"},"replies":{"comments":[{"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnail":"https://yt3.ggpht.com/nested"}]}}
    ]}))
    expect(described_class.from_comments(response)).to be_empty
  end

  it "collects only the explicitly supplied direct author despite misleading parents" do
    response = JSON.parse(%({"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","comments":[
      {"authorId":"UCXuqSBlHAE6Xw-yeJA0Tunw","authorThumbnail":"https://yt3.ggpht.com/author=s48","creatorHeart":{"creatorThumbnail":"https://yt3.ggpht.com/heart"},"sponsorIconUrl":"https://yt3.ggpht.com/sponsor","attachment":{"authorId":"UCX6OQ3DkcsbYNE6H8uQQuVA","authorThumbnails":[{"url":"https://yt3.ggpht.com/attachment"}]}}
    ]}))
    expect(described_class.from_comments(response)).to eq({"UCXuqSBlHAE6Xw-yeJA0Tunw" => "/ggpht/author=s88"})
  end
end

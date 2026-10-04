require "../parsers_helper"

private def avatar_lockup
  JSON.parse(File.read("#{__DIR__}/frontend/fixtures/avatar_lockups.json")).as_a.first
end

private def avatar_metadata(item)
  item["lockupViewModel"]["metadata"]["lockupMetadataViewModel"]
end

Spectator.describe "Channel avatar extraction from real video lockups" do
  it "preserves the linked channels and avatars in the captured playlist response" do
    items = JSON.parse(File.read("#{__DIR__}/frontend/fixtures/avatar_lockups.json")).as_a
    expected = [{"Lauv", "UCfLdIEPs1tYj4ieEdJnyNyw"}, {"Charlie Puth", "UCwppdrjsBPAZg5_cUwQjfMQ"}]
    items.each_with_index do |item, index|
      video = parse_item(item, "Playlist owner", "UCfallback").as(SearchVideo)
      expect({video.author, video.ucid}).to eq(expected[index])
      url = avatar_metadata(item).dig("image", "decoratedAvatarViewModel", "avatar", "avatarViewModel", "image", "sources", 0, "url").as_s
      expect(video.author_thumbnail).to eq(url)
    end
  end

  it "keeps author identity and the video when the avatar is missing or malformed" do
    [JSON.parse("null"), JSON.parse("42"), JSON.parse(%({"decoratedAvatarViewModel":{"avatar":"bad"}}))].each do |image|
      item = avatar_lockup
      avatar_metadata(item).as_h["image"] = image
      video = parse_item(item).as(SearchVideo)
      expect(video.id).to eq("MsSIVZlqC9w")
      expect(video.ucid).to eq("UCfLdIEPs1tYj4ieEdJnyNyw")
      expect(video.author_thumbnail).to be_nil
    end
    item = avatar_lockup
    avatar_metadata(item).as_h.delete("image")
    expect(parse_item(item).as(SearchVideo).author_thumbnail).to be_nil
  end

  it "rejects unrelated image URLs and tolerates malformed image sources" do
    item = avatar_lockup
    image = avatar_metadata(item).dig("image", "decoratedAvatarViewModel", "avatar", "avatarViewModel", "image")
    image.as_h["sources"] = JSON.parse(%([42,null,{"url":"https://example.com/avatar"}]))
    expect(parse_item(item).as(SearchVideo).author_thumbnail).to be_nil
  end

  it "does not attach another channel's avatar to the linked author" do
    item = avatar_lockup
    endpoint = avatar_metadata(item).dig("image", "decoratedAvatarViewModel", "rendererContext", "commandContext", "onTap", "innertubeCommand", "browseEndpoint")
    endpoint.as_h["browseId"] = JSON::Any.new("UCother")
    video = parse_item(item).as(SearchVideo)
    expect(video.ucid).to eq("UCfLdIEPs1tYj4ieEdJnyNyw")
    expect(video.author_thumbnail).to be_nil
  end

  it "rejects ambiguous author links even alongside malformed command runs" do
    item = avatar_lockup
    runs = avatar_metadata(item).dig("metadata", "contentMetadataViewModel", "metadataRows", 0, "metadataParts", 0, "text", "commandRuns").as_a
    runs.unshift(JSON.parse("42"))
    runs << JSON.parse(%({"onTap":{"innertubeCommand":{"browseEndpoint":{"browseId":"UCother"}}}}))
    video = parse_item(item, "Known channel", "UCfLdIEPs1tYj4ieEdJnyNyw").as(SearchVideo)
    expect(video.author_thumbnail).to be_nil
  end

  it "uses existing channel author fallbacks when item links are absent" do
    item = avatar_lockup
    avatar_metadata(item).dig("metadata", "contentMetadataViewModel", "metadataRows").as_a.shift
    video = parse_item(item, "Lauv", "UCfLdIEPs1tYj4ieEdJnyNyw").as(SearchVideo)
    expect(video.author).to eq("Lauv")
    expect(video.author_thumbnail).not_to be_nil
    expect(parse_item(item, "Other channel", "UCother").as(SearchVideo).author_thumbnail).to be_nil
  end

  it "leaves existing avatar-less channel cards on their author fallback" do
    items = JSON.parse(File.read("#{__DIR__}/frontend/fixtures/member_lockups.json")).as_a
    items.each do |item|
      video = parse_item(item, "Linus Tech Tips", "UCXuqSBlHAE6Xw-yeJA0Tunw").as(SearchVideo)
      expect(video.author).to eq("Linus Tech Tips")
      expect(video.ucid).to eq("UCXuqSBlHAE6Xw-yeJA0Tunw")
      expect(video.author_thumbnail).to be_nil
      expect(video.members_only).to be_true
    end
  end

  it "reads views and publication metadata without treating linked author names as dates" do
    item = avatar_lockup
    text = avatar_metadata(item).dig("metadata", "contentMetadataViewModel", "metadataRows", 0, "metadataParts", 0, "text")
    text.as_h["content"] = JSON::Any.new("ImagineDragons")
    video = parse_item(item).as(SearchVideo)
    expect(video.author).to eq("ImagineDragons")
    expect(video.views).to eq(106_000_000_i64)
    expect(video.published).to be_close(Time.utc - 2.years, 1.second)
    expect(video.author_thumbnail).not_to be_nil
  end
end

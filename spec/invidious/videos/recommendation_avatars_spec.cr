require "../../parsers_helper"

private def recommendation_avatar_items
  JSON.parse(File.read("#{__DIR__}/../frontend/fixtures/recommendation_avatar_lockups.json")).as_a
end

private def recommendation_metadata(item)
  item.dig("lockupViewModel", "metadata", "lockupMetadataViewModel")
end

private def recommendation_info(items)
  raw = load_mock("video/regular_mrbeast.player").merge(load_mock("video/regular_mrbeast.next"))
  raw["contents"].dig("twoColumnWatchNextResults", "secondaryResults", "secondaryResults").as_h["results"] = JSON::Any.new(items)
  Invidious::Videos::Parser.parse_video_info("2isYuQZMbdU", raw)
end

Spectator.describe "Recommendation avatar extraction" do
  it "recovers identities from real avatar links even when creator text is unlinked" do
    items = recommendation_avatar_items
    expected = [{"MrBeast", "UCX6OQ3DkcsbYNE6H8uQQuVA"}, {"MrBeast Gaming", "UCIPPMRA040LQr5QPyJEbmXA"}]
    items.first(2).each_with_index do |item, index|
      text = recommendation_metadata(item).dig("metadata", "contentMetadataViewModel", "metadataRows", 0, "metadataParts", 0, "text")
      expect(text["commandRuns"]?).to be_nil
      video = parse_item(item).as(SearchVideo)
      expect({video.author, video.ucid}).to eq(expected[index])
      expect(Invidious::ChannelAvatars.proxy_url(video.author_thumbnail)).not_to be_nil
    end
  end

  it "preserves real recommendation order, metadata and collaboration labels" do
    items = recommendation_avatar_items
    videos = recommendation_info(items)["relatedVideos"].as_a
    expect(videos.map(&.["id"].as_s)).to eq(items.map(&.dig("lockupViewModel", "contentId").as_s))
    expect(videos.map(&.["title"].as_s)).to eq(items.map(&.dig("lockupViewModel", "metadata", "lockupMetadataViewModel", "title", "content").as_s))
    expect(videos.map(&.["length_seconds"].as_s)).to eq(%w(941 979 1214))
    expect(videos.map(&.["short_view_count"].as_s)).to eq(%w(476M 36M 25M))
    expect(videos.first["author_verified"].as_s).to eq("true")
    expect(Time.parse_rfc3339(videos.first["published"].as_s)).to be_close(Time.utc - 3.years, 1.second)
    expect(videos.last["author"].as_s).to eq("MrBeast 2 and MrBeast")
    expect(videos.last["ucid"].as_s).to be_empty
    expect(videos.last["author_thumbnail"]?).to be_nil
  end

  it "keeps videos and existing channel fallbacks when optional avatar data is malformed" do
    [JSON.parse("null"), JSON.parse("42"), JSON.parse(%({"decoratedAvatarViewModel":{"avatar":"bad"}}))].each do |image|
      item = recommendation_avatar_items.first
      recommendation_metadata(item).as_h["image"] = image
      video = parse_item(item, "Known creator", "UCknown").as(SearchVideo)
      expect(video.id).to eq("iogcY_4xGjo")
      expect({video.author, video.ucid}).to eq({"Known creator", "UCknown"})
      expect(video.author_thumbnail).to be_nil
      expect(Invidious::Videos::Parser.parse_related_lockup(item)).not_to be_nil
    end
    item = recommendation_avatar_items.first
    recommendation_metadata(item).as_h.delete("image")
    expect(parse_item(item).as(SearchVideo).author_thumbnail).to be_nil
  end

  it "rejects bad avatar URLs while retaining the explicit channel identity" do
    item = recommendation_avatar_items.first
    image = recommendation_metadata(item).dig("image", "decoratedAvatarViewModel", "avatar", "avatarViewModel", "image")
    image.as_h["sources"] = JSON.parse(%([null,42,{"url":"https://example.com/avatar"}]))
    video = parse_item(item).as(SearchVideo)
    expect(video.ucid).to eq("UCX6OQ3DkcsbYNE6H8uQQuVA")
    expect(video.author_thumbnail).to be_nil
  end

  it "does not accept malformed avatar IDs through a known channel fallback" do
    item = recommendation_avatar_items.first
    endpoint = recommendation_metadata(item).dig("image", "decoratedAvatarViewModel", "rendererContext", "commandContext", "onTap", "innertubeCommand", "browseEndpoint")
    endpoint.as_h["browseId"] = JSON.parse("42")
    video = parse_item(item, "Known creator", "UCknown").as(SearchVideo)
    expect(video.ucid).to eq("UCknown")
    expect(video.author_thumbnail).to be_nil
  end

  it "preserves linked author precedence but rejects conflicting avatar identities" do
    item = recommendation_avatar_items.first
    text = recommendation_metadata(item).dig("metadata", "contentMetadataViewModel", "metadataRows", 0, "metadataParts", 0, "text")
    text.as_h["commandRuns"] = JSON.parse(%([{"onTap":{"innertubeCommand":{"browseEndpoint":{"browseId":"UCdifferent"}}}}]))
    video = parse_item(item).as(SearchVideo)
    expect(video.ucid).to eq("UCdifferent")
    expect(video.author_thumbnail).to be_nil
    text["commandRuns"].as_a << JSON.parse(%({"onTap":{"innertubeCommand":{"browseEndpoint":{"browseId":"UCother"}}}}))
    video = parse_item(item, "Known creator", "UCknown").as(SearchVideo)
    expect(video.ucid).to eq("UCknown")
    expect(video.author_thumbnail).to be_nil
  end

  it "does not treat unlinked creator names as dates or view counts" do
    item = recommendation_avatar_items.first
    text = recommendation_metadata(item).dig("metadata", "contentMetadataViewModel", "metadataRows", 0, "metadataParts", 0, "text")
    text.as_h["content"] = JSON::Any.new("5 years ago")
    video = parse_item(item).as(SearchVideo)
    expect(video.author).to eq("5 years ago")
    expect(video.views).to eq(476_000_000_i64)
    expect(video.published).to be_close(Time.utc - 3.years, 1.second)
    text.as_h["content"] = JSON::Any.new("ImagineDragons")
    expect(parse_item(item).as(SearchVideo).published).to be_close(Time.utc - 3.years, 1.second)
  end

  it "retains membership markers and leaves missing publication data unknown" do
    item = recommendation_avatar_items.first
    rows = recommendation_metadata(item).dig("metadata", "contentMetadataViewModel", "metadataRows").as_a
    rows[1]["metadataParts"].as_a.pop
    rows << JSON.parse(%({"metadataParts":[{"text":{"content":"Members only"}}]}))
    video = Invidious::Videos::Parser.parse_related_lockup(item).not_nil!
    expect(video["members_only"].as_s).to eq("true")
    expect(video["published"].as_s).to be_empty
  end

  it "extracts older compact avatars without accepting conflicting byline channels" do
    raw = load_mock("video/regular_mrbeast.next")["contents"].dig("twoColumnWatchNextResults", "secondaryResults", "secondaryResults", "results", 0, "compactVideoRenderer")
    video = Invidious::Videos::Parser.parse_related_video(raw).not_nil!
    expect(video["author_thumbnail"].as_s).to eq(raw.dig("channelThumbnail", "thumbnails", 0, "url").as_s)
    raw["shortBylineText"]["runs"].as_a << JSON.parse(%({"text":"Other","navigationEndpoint":{"browseEndpoint":{"browseId":"UCother"}}}))
    expect(Invidious::Videos::Parser.parse_related_video(raw).not_nil!["author_thumbnail"]?).to be_nil
    raw.as_h["channelThumbnail"] = JSON.parse("42")
    expect(Invidious::Videos::Parser.parse_related_video(raw)).not_to be_nil
  end

  it "mixes compact and modern cards in upstream order and retains end-screen fallback" do
    compact = load_mock("video/regular_mrbeast.next")["contents"].dig("twoColumnWatchNextResults", "secondaryResults", "secondaryResults", "results", 0)
    modern = recommendation_avatar_items.first
    ignored = JSON.parse(%({"continuationItemRenderer":{}}))
    videos = recommendation_info([modern, ignored, compact])["relatedVideos"].as_a
    expect(videos.map(&.["id"].as_s)).to eq([modern.dig("lockupViewModel", "contentId").as_s, compact.dig("compactVideoRenderer", "videoId").as_s])
    expect(recommendation_info([ignored])["relatedVideos"].as_a.size).to eq(12)
  end

  it "collects only valid associated URLs and preserves the main creator avatar" do
    info = recommendation_info(recommendation_avatar_items)
    info["authorThumbnail"] = JSON::Any.new("https://yt3.ggpht.com/main=s48")
    video = Video.new({id: "2isYuQZMbdU", info: info, updated: Time.utc})
    avatars = Invidious::ChannelAvatars.from_video(video)
    expect(avatars.size).to eq(2)
    expect(avatars[video.ucid]).to eq("/ggpht/main=s88")
    recommended_url = video.related_videos[1]["author_thumbnail"]
    expect(avatars["UCIPPMRA040LQr5QPyJEbmXA"]).to eq(Invidious::ChannelAvatars.proxy_url(recommended_url))
  end
end

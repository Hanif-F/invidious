require "../../spec_helper"
require "../../parsers_helper"
require "../../../src/invidious/playlists/mixes"
require "../../../src/invidious/frontend/channel_spoilers"
require "../../../src/invidious/frontend/channel_avatars"
require "../../../src/invidious/frontend/desktop"
require "../../../src/invidious/jsonify/api_v1/common"

HOST_URL = "https://invidious.test"

private def queue_test_data
  JSON.parse({playlistId: "PLtest", mixId: "RDtest", title: "A <playlist>", videoCount: 2, videos: [
    {videoId: "repeat12345", index: 0, title: "<script>alert(1)</script>", author: "A & B", lengthSeconds: 90},
    {videoId: "repeat12345", index: 1, title: "Second occurrence", author: "Author", lengthSeconds: 0},
  ]}.to_json)
end

Spectator.describe "Watch queue rendering" do
  it "retains occurrence indices without duplicate DOM IDs" do
    html = Invidious::Playlists::Playlists.template_playlist(queue_test_data, false)
    expect(html).to contain(%(data-index="0"), %(data-index="1"))
    expect(html).to contain("&amp;index=0", "&amp;index=1")
    expect(html).to_not contain(%( id="repeat12345"))
  end

  it "escapes upstream titles, authors, and metadata" do
    html = Invidious::Playlists::Playlists.template_playlist(queue_test_data, false)
    expect(html).to contain("A &lt;playlist&gt;", "&lt;script&gt;", "A &amp; B")
    expect(html).to_not contain("<script>")
  end

  it "does not request thumbnails in thin mode" do
    html = Invidious::Playlists::Playlists.template_playlist(queue_test_data, true, true)
    expect(html).to_not contain("<img")
    expect(html).to contain("&amp;listen=1")
  end

  it "keeps mix navigation independent from playlist indices" do
    html = template_mix(queue_test_data, false)
    expect(html).to contain("list=RDtest")
    expect(html).to_not contain("&amp;index=")
  end

  it "passes only known publication dates to the desktop queue projection" do
    published = Time.utc(2020, 1, 2)
    video = PlaylistVideo.new({
      title: "Video", id: "repeat12345", author: "Author", ucid: "",
      length_seconds: 90, published: published, plid: "PLtest", index: 0_i64, live_now: false, members_only: false,
    })
    expect(video.to_json(nil)).to_not contain(%("published"))
    desktop_json = JSON.build { |json| video.to_json(json, include_publication: true) }
    expect(JSON.parse(desktop_json)["published"].as_i64).to eq(published.to_unix)

    video.published_known = false
    desktop_json = JSON.build { |json| video.to_json(json, include_publication: true) }
    expect(desktop_json).to_not contain(%("published"))
  end
end

Spectator.describe "Editable watch queues" do
  it "exposes stable occurrence IDs only for editable playlists, without losing 64-bit precision" do
    data = JSON.parse({playlistId: "IVtest", mixId: "RDtest", title: "Playlist", videoCount: 2, videos: [
      {videoId: "repeat12345", index: 0, indexId: "20000000000001", title: "First", author: "Author", lengthSeconds: 90},
      {videoId: "repeat12345", index: 1, indexId: "20000000000002", title: "Second", author: "Author", lengthSeconds: 90},
    ]}.to_json)
    expect(Invidious::Playlists::Playlists.template_playlist(data, false)).to_not contain("data-remove-index")
    expect(Invidious::Playlists::Playlists.template_playlist(data, false, false, true)).to contain(%(data-remove-index="9007199254740993"), %(data-remove-index="9007199254740994"))
    expect(Invidious::Playlists::Playlists.template_queue(data, false, true, false, true)).to_not contain("data-remove-index")
  end
end

require "../../spec_helper"
require "../../../src/invidious/mixes"

private def queue_test_data
  JSON.parse({playlistId: "PLtest", mixId: "RDtest", title: "A <playlist>", videoCount: 2, videos: [
    {videoId: "repeat12345", index: 0, title: "<script>alert(1)</script>", author: "A & B", lengthSeconds: 90},
    {videoId: "repeat12345", index: 1, title: "Second occurrence", author: "Author", lengthSeconds: 0},
  ]}.to_json)
end

Spectator.describe "Watch queue rendering" do
  it "retains occurrence indices without duplicate DOM IDs" do
    html = template_playlist(queue_test_data, false)
    expect(html).to contain(%(data-index="0"), %(data-index="1"))
    expect(html).to contain("&amp;index=0", "&amp;index=1")
    expect(html).to_not contain(%( id="repeat12345"))
  end

  it "escapes upstream titles, authors, and metadata" do
    html = template_playlist(queue_test_data, false)
    expect(html).to contain("A &lt;playlist&gt;", "&lt;script&gt;", "A &amp; B")
    expect(html).to_not contain("<script>")
  end

  it "does not request thumbnails in thin mode" do
    html = template_playlist(queue_test_data, true, true)
    expect(html).to_not contain("<img")
    expect(html).to contain("&amp;listen=1")
  end

  it "keeps mix navigation independent from playlist indices" do
    html = template_mix(queue_test_data, false)
    expect(html).to contain("list=RDtest")
    expect(html).to_not contain("&amp;index=")
  end
end

Spectator.describe "Editable watch queues" do
  it "exposes stable occurrence IDs only for editable playlists, without losing 64-bit precision" do
    data = JSON.parse({playlistId: "IVtest", mixId: "RDtest", title: "Playlist", videoCount: 2, videos: [
      {videoId: "repeat12345", index: 0, indexId: "20000000000001", title: "First", author: "Author", lengthSeconds: 90},
      {videoId: "repeat12345", index: 1, indexId: "20000000000002", title: "Second", author: "Author", lengthSeconds: 90},
    ]}.to_json)
    expect(template_playlist(data, false)).to_not contain("data-remove-index")
    expect(template_playlist(data, false, false, true)).to contain(%(data-remove-index="9007199254740993"), %(data-remove-index="9007199254740994"))
    expect(template_queue(data, false, true, false, true)).to_not contain("data-remove-index")
  end
end

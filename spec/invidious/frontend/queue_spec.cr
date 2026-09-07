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

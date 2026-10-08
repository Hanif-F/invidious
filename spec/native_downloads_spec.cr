require "spec"
require "../src/invidious/videos/downloads"

describe Invidious::Videos::Downloads do
  it "includes only separate finite media and caption tracks" do
    video = JSON.parse(%({"adaptiveFormats":[{"itag":"137","type":"video/mp4","url":"/video"},{"itag":"140","type":"audio/mp4","url":"/audio"},{"itag":"300","type":"video/mp4","url":"/live","targetDurationSec":5},{"type":"text/mp4","url":"/text"}],"formatStreams":[{"itag":"18","type":"video/mp4","url":"/combined"}],"captions":[{"label":"English","language_code":"en","url":"/caption"}]}))
    choices = Invidious::Videos::Downloads.choices(video)
    choices.map { |entry| entry["kind"].as_s }.should eq(["video", "audio", "caption"])
  end
  it "keeps dubbed and stable-volume variants sharing itags distinct across URL refreshes" do
    first = JSON.parse(%({"itag":"140","bitrate":"128000","audioTrack":{"id":"en.1"},"isDrc":false,"url":"first"}))
    refreshed = JSON.parse(first.to_json).as_h
    refreshed["url"] = JSON::Any.new("new-url")
    base = Invidious::Videos::Downloads.key("audio", first)
    Invidious::Videos::Downloads.key("audio", JSON::Any.new(refreshed)).should eq(base)
    dubbed = refreshed.dup; dubbed["audioTrack"] = JSON.parse(%({"id":"es.1"}))
    Invidious::Videos::Downloads.key("audio", JSON::Any.new(dubbed)).should_not eq(base)
    refreshed["isDrc"] = JSON::Any.new(true)
    Invidious::Videos::Downloads.key("audio", JSON::Any.new(refreshed)).should_not eq(base)
  end
  it "explains instance restrictions, restricted videos, live/upcoming content and absent separate tracks" do
    video = JSON.parse(%({"adaptiveFormats":[{"itag":"140","type":"audio/mp4","url":"/audio"}]}))
    Invidious::Videos::Downloads.reason(video, false, false).should eq("")
    Invidious::Videos::Downloads.reason(video, true, false).should contain("disabled")
    Invidious::Videos::Downloads.reason(video, false, true).should contain("unavailable")
    {"liveNow", "isUpcoming"}.each do |flag|
      copy = video.as_h.dup; copy[flag] = JSON::Any.new(true)
      Invidious::Videos::Downloads.reason(JSON::Any.new(copy), false, false).should contain("Live and upcoming")
    end
    Invidious::Videos::Downloads.reason(JSON.parse("{}"), false, false).should contain("No separate")
  end
  it "wraps every catalog choice in a guarded public URL and removes restricted choices" do
    video = JSON.parse(%({"title":"Fixture","adaptiveFormats":[{"itag":"140","type":"audio/mp4","url":"https://origin.example/videoplayback?itag=140"}]}))
    catalog = JSON.parse(Invidious::Videos::Downloads.catalog(video, "testvideo01", false, false, "US"))
    catalog["video"].should eq(video)
    catalog["allowed"].as_bool.should be_true
    choice = catalog["choices"][0]
    choice["url"].as_s.should eq("/api/v1/videos/testvideo01/download?key=#{choice["key"]}&region=US")
    Invidious::Videos::Downloads.resolve(video, choice["key"].as_s).not_nil!["itag"].as_s.should eq("140")
    Invidious::Videos::Downloads.resolve(video, "140").should be_nil
    Invidious::Videos::Downloads.resolve(video, nil).should be_nil
    restricted = JSON.parse(Invidious::Videos::Downloads.catalog(video, "testvideo01", true, false))
    restricted["allowed"].as_bool.should be_false
    restricted["choices"].as_a.should be_empty
  end
  it "keeps the exact audio variant and refuses alternate destinations" do
    video = JSON.parse(%({"adaptiveFormats":[{"itag":"140","type":"audio/mp4","audioTrack":{"id":"en.1"},"url":"https://origin.example/videoplayback?itag=140&xtags=lang%3Den"},{"itag":"140","type":"audio/mp4","audioTrack":{"id":"es.1"},"url":"https://origin.example/videoplayback?itag=140&xtags=lang%3Des"}]}))
    key = Invidious::Videos::Downloads.choices(video)[1]["key"].as_s
    selected = Invidious::Videos::Downloads.resolve(video, key).not_nil!
    url = URI.parse(Invidious::Videos::Downloads.media_url(selected, "https://origin.example", "A/b\nTitle").not_nil!)
    url.query_params["xtags"].should eq("lang=es")
    url.query_params["title"].should eq("A_b_Title")
    removed = video.as_h.dup
    removed["adaptiveFormats"] = JSON::Any.new([video["adaptiveFormats"][0]])
    Invidious::Videos::Downloads.resolve(JSON::Any.new(removed), key).should be_nil
    {"https://other.example/videoplayback", "https://origin.example/redirect", "https://user@origin.example/videoplayback"}.each do |target|
      entry = selected.as_h.dup; entry["url"] = JSON::Any.new(target)
      Invidious::Videos::Downloads.media_url(JSON::Any.new(entry), "https://origin.example", "Fixture").should be_nil
    end
  end
end

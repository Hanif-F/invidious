require "spec"
require "../src/invidious/sponsorblock"

private def sb_body
  [{videoID: "abcdefghijk", segments: [
    {UUID: "one", category: "sponsor", actionType: "skip", segment: [10.0, 20.0]},
    {UUID: "bad", category: "sponsor", actionType: "skip", segment: [30.0, 20.0]},
    {UUID: "mute", category: "sponsor", actionType: "mute", segment: [10.0, 20.0]},
    {UUID: "unknown", category: "unknown", actionType: "skip", segment: [10.0, 20.0]},
  ]}].to_json
end

describe Invidious::SponsorBlock do
  it "filters malformed, unsupported and unrelated segments" do
    segments = Invidious::SponsorBlock.parse(sb_body, "abcdefghijk")
    segments.size.should eq(1)
    segments[0].start.should eq(10)
    segments[0].end.should eq(20)
    integer_body = %([{"videoID":"abcdefghijk","segments":[{"UUID":"integer","category":"intro","actionType":"skip","segment":[0,12]}]}])
    Invidious::SponsorBlock.parse(integer_body, "abcdefghijk").size.should eq(1)
    Invidious::SponsorBlock.parse(sb_body, "other_video").should be_empty
  end

  it "validates IDs before fetching and expires cached results" do
    calls = 0
    now = 0.seconds
    client = Invidious::SponsorBlock::Client.new(->(id : String) {
      calls += 1
      Invidious::SponsorBlock::Result.new(Invidious::SponsorBlock.parse(sb_body, id), 1.hour)
    }, -> { now })
    client.segments("../invalid").should be_empty
    calls.should eq(0)
    2.times { client.segments("abcdefghijk").size.should eq(1) }
    calls.should eq(1)
    now += 1.hour
    client.segments("abcdefghijk")
    calls.should eq(2)
  end

  it "uses separate successful, missing and failure cache lifetimes" do
    {200 => 1.hour, 404 => 10.minutes, 429 => 30.seconds, 500 => 30.seconds}.each do |status, ttl|
      Invidious::SponsorBlock.result(HTTP::Client::Response.new(status, body: sb_body), "abcdefghijk").ttl.should eq(ttl)
    end
    Invidious::SponsorBlock.result(HTTP::Client::Response.new(200, body: "[]"), "abcdefghijk").ttl.should eq(10.minutes)
    calls = 0
    now = 0.seconds
    client = Invidious::SponsorBlock::Client.new(->(_id : String) {
      calls += 1
      raise IO::Error.new("offline")
      Invidious::SponsorBlock::Result.new([] of Invidious::SponsorBlock::Segment, 1.hour)
    }, -> { now })
    2.times { client.segments("abcdefghijk").should be_empty }
    calls.should eq(1)
    now += 30.seconds
    client.segments("abcdefghijk").should be_empty
    calls.should eq(2)
  end

  it "normalizes modes and colors" do
    Invidious::SponsorBlock::Modes.normalize({"sponsor" => "bogus"})["sponsor"].should eq("manual")
    Invidious::SponsorBlock::Modes.normalize({"sponsor" => "disabled"})["sponsor"].should eq("disabled")
    Invidious::SponsorBlock::Colors.normalize({"sponsor" => "bad"})["sponsor"].should eq("#4caf50")
  end
end

describe Invidious::SponsorBlock::Client do
  it "bounds the cache and coalesces simultaneous lookups" do
    calls = 0
    active = 0
    peak = 0
    client = Invidious::SponsorBlock::Client.new(->(id : String) {
      calls += 1
      active += 1
      peak = Math.max(peak, active)
      Fiber.yield
      active -= 1
      Invidious::SponsorBlock::Result.new([] of Invidious::SponsorBlock::Segment, 1.hour)
    })
    done = Channel(Nil).new(20)
    20.times do |i|
      id = i.even? ? "abcdefghijk" : i.to_s.rjust(11, '0')
      spawn { client.segments(id); done.send(nil) }
    end
    20.times { done.receive }
    calls.should eq(11)
    peak.should eq(4)
    calls = 0
    bounded = Invidious::SponsorBlock::Client.new(->(_id : String) {
      calls += 1
      Invidious::SponsorBlock::Result.new([] of Invidious::SponsorBlock::Segment, 1.hour)
    }, capacity: 2)
    {"aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "aaaaaaaaaaa"}.each { |id| bounded.segments(id) }
    calls.should eq(4)
  end
end

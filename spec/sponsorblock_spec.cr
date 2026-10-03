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

describe "SponsorBlock native preference deltas" do
  it "rejects invalid nested fields and accepts inheritance/reset" do
    invalid = [
      %({"sponsorblock_enabled":"true"}), %({"sponsorblock_modes":{"other":"auto"}}),
      %({"sponsorblock_modes":{"intro":"inherit"}}), %({"sponsorblock_colors":{"sponsor":"red"}}),
      %({"sponsorblock_channel_overrides":{"UCinvalid":null}}),
      %({"sponsorblock_channel_overrides":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"enabled":"false"}}}),
      %({"sponsorblock_channel_overrides":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"name":"Untrusted","enabled":true}}}),
      %({"sponsorblock_channel_overrides":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"modes":{"intro":null}}}}),
    ]
    invalid.each do |body|
      expect_raises(Exception) { Invidious::SponsorBlock.validate_patch(JSON.parse(body).as_h) }
    end
    Invidious::SponsorBlock.validate_patch(JSON.parse(%({"sponsorblock_channel_overrides":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"enabled":null,"modes":{"intro":"auto"}},"UCbbbbbbbbbbbbbbbbbbbbbb":null}})).as_h)
  end

  it "merges category deltas and preserves other channels and unknown preferences" do
    a = "UC" + "a" * 22
    b = "UC" + "b" * 22
    stored = JSON.parse({theme: "diary", future: {keep: true}, sponsorblock_modes: {sponsor: "manual", intro: "marker"}, sponsorblock_channel_overrides: {
      a => {name: "Existing", enabled: false, modes: {sponsor: "manual"}}, b => {name: "Other", enabled: true, modes: {} of String => String},
    }}.to_json).as_h
    data = JSON.parse({sponsorblock_modes: {sponsor: "auto"}, sponsorblock_colors: {intro: "#123ABC"}, sponsorblock_channel_overrides: {a => {enabled: nil, modes: {intro: "marker"}}}}.to_json).as_h
    Invidious::SponsorBlock.validate_patch(data)
    Invidious::SponsorBlock.merge_patch(stored, data, {} of String => String)
    stored["theme"].as_s.should eq("diary")
    stored["future"]["keep"].as_bool.should be_true
    stored["sponsorblock_modes"]["intro"].as_s.should eq("marker")
    stored["sponsorblock_modes"]["sponsor"].as_s.should eq("auto")
    stored["sponsorblock_channel_overrides"][a]["name"].as_s.should eq("Existing")
    stored["sponsorblock_channel_overrides"][a]["enabled"].raw.should be_nil
    stored["sponsorblock_channel_overrides"][a]["modes"].as_h.has_key?("sponsor").should be_false
    stored["sponsorblock_channel_overrides"][b]["enabled"].as_bool.should be_true
    Invidious::SponsorBlock.merge_patch(stored, JSON.parse({sponsorblock_channel_overrides: {a => nil}}.to_json).as_h, {} of String => String)
    stored["sponsorblock_channel_overrides"].as_h.has_key?(a).should be_false
    stored["sponsorblock_channel_overrides"].as_h.has_key?(b).should be_true
  end

  it "uses server-resolved names and deletes all-inherited overrides" do
    id = "UC" + "a" * 22
    stored = JSON.parse("{}").as_h
    Invidious::SponsorBlock.merge_patch(stored, JSON.parse({sponsorblock_channel_overrides: {id => {enabled: false, modes: {} of String => String}}}.to_json).as_h, {id => "Resolved channel"})
    stored["sponsorblock_channel_overrides"][id]["name"].as_s.should eq("Resolved channel")
    Invidious::SponsorBlock.merge_patch(stored, JSON.parse({sponsorblock_channel_overrides: {id => {enabled: nil, modes: {} of String => String}}}.to_json).as_h, {} of String => String)
    stored["sponsorblock_channel_overrides"].as_h.should be_empty
  end
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

describe "Channel SponsorBlock overrides" do
  id = "UC" + "a" * 22
  it "accepts channel IDs and channel URLs without resolving arbitrary URLs" do
    Invidious::SponsorBlock.channel_id(id).should eq(id)
    Invidious::SponsorBlock.channel_id("https://youtube.com/channel/#{id}").should eq(id)
    Invidious::SponsorBlock.channel_id("/channel/#{id}").should eq(id)
    Invidious::SponsorBlock.channel_id("https://example.com/other").should be_nil
    Invidious::SponsorBlock.channel_id("UCinvalid").should be_nil
  end
  it "drops malformed overrides and preserves explicit false and valid modes" do
    raw = JSON.parse({id => {name: "Channel", enabled: false, modes: {sponsor: "auto", intro: "wrong", unknown: "auto"}}, "invalid" => {enabled: true}}.to_json)
    overrides = Invidious::SponsorBlock::ChannelOverrides.normalize(raw)
    overrides.size.should eq(1)
    overrides[id].enabled.should eq(false)
    overrides[id].modes.should eq({"sponsor" => "auto"})
    Invidious::SponsorBlock::ChannelOverrides.normalize(JSON.parse({id => {enabled: "wrong", modes: {intro: 42}}}.to_json)).should be_empty
  end
  it "inherits categories without changing global modes and overrides enablement both ways" do
    modes = Invidious::SponsorBlock::Modes.normalize({"sponsor" => "manual"})
    {"auto", "manual", "marker", "disabled"}.each do |mode|
      entry = Invidious::SponsorBlock::ChannelOverride.new("Channel", true, {"sponsor" => mode})
      enabled, effective = Invidious::SponsorBlock.effective(false, modes, entry)
      enabled.should be_true
      effective["sponsor"].should eq(mode)
      effective["intro"].should eq("manual")
      modes["sponsor"].should eq("manual")
    end
    entry = Invidious::SponsorBlock::ChannelOverride.new("Channel", false, {} of String => String)
    Invidious::SponsorBlock.effective(true, modes, entry)[0].should be_false
    entry.enabled = nil
    Invidious::SponsorBlock.effective(true, modes, entry)[0].should be_true
    Invidious::SponsorBlock.effective(false, modes, nil).should eq({false, modes})
  end
end

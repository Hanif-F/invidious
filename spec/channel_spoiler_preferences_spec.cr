require "spec"
require "../src/invidious/channel_spoiler_preferences"

private def masking_raw_preferences
  JSON.parse(%({"future":{"keep":[true,2,null]},"chat_overlay_x":2.0,"channel_spoiler_settings":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"name":"Latest name","hide_title":true,"hide_thumbnail":false,"reveal_after_days":7,"native_future":{"keep":true}},"UCbbbbbbbbbbbbbbbbbbbbbb":{"name":"Other channel","hide_title":false,"hide_thumbnail":true,"reveal_after_days":null,"future":123}}})).as_h
end

describe "Channel masking web rule merge" do
  it "patches one complete rule without mutating the input or normalizing other raw values" do
    stored = masking_raw_preferences
    before = stored.to_json
    rule = Invidious::ChannelSpoilers::Rule.new("Stale name", false, true, 14)
    result = Invidious::ChannelSpoilers.merge_web_rule(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", rule)
    stored.to_json.should eq(before)
    result["future"].should eq(stored["future"])
    result["chat_overlay_x"].should eq(stored["chat_overlay_x"])
    result["channel_spoiler_settings"]["UCbbbbbbbbbbbbbbbbbbbbbb"].should eq(stored["channel_spoiler_settings"]["UCbbbbbbbbbbbbbbbbbbbbbb"])
    target = result["channel_spoiler_settings"]["UCaaaaaaaaaaaaaaaaaaaaaa"]
    target["name"].should eq("Latest name")
    target["hide_title"].should eq(false)
    target["hide_thumbnail"].should eq(true)
    target["reveal_after_days"].should eq(14)
    target["native_future"].should eq(stored["channel_spoiler_settings"]["UCaaaaaaaaaaaaaaaaaaaaaa"]["native_future"])
  end

  it "removes only an explicitly reset channel, including its future properties" do
    stored = masking_raw_preferences
    result = Invidious::ChannelSpoilers.merge_web_rule(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", nil)
    result["channel_spoiler_settings"].as_h.has_key?("UCaaaaaaaaaaaaaaaaaaaaaa").should be_false
    result["channel_spoiler_settings"]["UCbbbbbbbbbbbbbbbbbbbbbb"].should eq(stored["channel_spoiler_settings"]["UCbbbbbbbbbbbbbbbbbbbbbb"])
    stored["channel_spoiler_settings"].as_h.size.should eq(2)
  end

  it "clears known switches while retaining future target properties" do
    stored = masking_raw_preferences
    rule = Invidious::ChannelSpoilers::Rule.new("Stale name", false, false)
    result = Invidious::ChannelSpoilers.merge_web_rule(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", rule)
    target = result["channel_spoiler_settings"]["UCaaaaaaaaaaaaaaaaaaaaaa"]
    target["native_future"].should eq(stored["channel_spoiler_settings"]["UCaaaaaaaaaaaaaaaaaaaaaa"]["native_future"])
    target["hide_title"].should eq(false)
    target["hide_thumbnail"].should eq(false)
    target["reveal_after_days"].raw.should be_nil
    Invidious::ChannelSpoilers::Rules.normalize(result["channel_spoiler_settings"]).has_key?("UCaaaaaaaaaaaaaaaaaaaaaa").should be_false
  end

  it "removes a wholly known inactive entry and can add a new indefinite rule" do
    stored = JSON.parse(%({"channel_spoiler_settings":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"name":"Channel","hide_title":true,"hide_thumbnail":false,"reveal_after_days":7}}})).as_h
    result = Invidious::ChannelSpoilers.merge_web_rule(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", Invidious::ChannelSpoilers::Rule.new("Channel", false, false))
    result["channel_spoiler_settings"].as_h.should be_empty
    rule = Invidious::ChannelSpoilers::Rule.new("New <channel>", true, true)
    added = Invidious::ChannelSpoilers.merge_web_rule(result, "UCcccccccccccccccccccccc", rule)
    target = added["channel_spoiler_settings"]["UCcccccccccccccccccccccc"]
    target["name"].should eq("New <channel>")
    target["reveal_after_days"].raw.should be_nil
    Invidious::ChannelSpoilers.merge_web_rule(added, "UCcccccccccccccccccccccc", rule).should eq(added)
  end

  it "rejects invalid IDs, nonpositive days and an opaque stored map" do
    stored = masking_raw_preferences
    expect_raises(ArgumentError) { Invidious::ChannelSpoilers.merge_web_rule(stored, "invalid", nil) }
    expect_raises(ArgumentError) { Invidious::ChannelSpoilers.merge_web_rule(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", Invidious::ChannelSpoilers::Rule.new("Channel", true, false, 0)) }
    opaque = JSON.parse(%({"channel_spoiler_settings":"opaque"})).as_h
    expect_raises(ArgumentError) { Invidious::ChannelSpoilers.merge_web_rule(opaque, "UCaaaaaaaaaaaaaaaaaaaaaa", nil) }
    opaque["channel_spoiler_settings"].should eq("opaque")
  end

  it "enforces the rule limit on additions while allowing edits and removal at the limit" do
    rules = (0...1000).to_h { |i| {"UC#{i.to_s.rjust(22, '0')}", JSON.parse(%({"name":"Channel","hide_title":true,"hide_thumbnail":false,"reveal_after_days":null}))} }
    stored = {"channel_spoiler_settings" => JSON::Any.new(rules)}
    rule = Invidious::ChannelSpoilers::Rule.new("Channel", true, false)
    expect_raises(ArgumentError) { Invidious::ChannelSpoilers.merge_web_rule(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", rule) }
    Invidious::ChannelSpoilers.merge_web_rule(stored, "UC0000000000000000000000", rule)["channel_spoiler_settings"].as_h.size.should eq(1000)
    Invidious::ChannelSpoilers.merge_web_rule(stored, "UC0000000000000000000000", nil)["channel_spoiler_settings"].as_h.size.should eq(999)
  end
end

it "rejects an opaque selected rule until an explicit removal" do
  stored = JSON.parse(%({"channel_spoiler_settings":{"UCaaaaaaaaaaaaaaaaaaaaaa":"future representation"}})).as_h
  entry = Invidious::ChannelSpoilers::Rule.new("Channel", true, false)
  expect_raises(ArgumentError) { Invidious::ChannelSpoilers.merge_web_rule(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", entry) }
  stored["channel_spoiler_settings"]["UCaaaaaaaaaaaaaaaaaaaaaa"].should eq("future representation")
  Invidious::ChannelSpoilers.merge_web_rule(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", nil)["channel_spoiler_settings"].as_h.should be_empty
end

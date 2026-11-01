require "spec"
require "../src/invidious/sponsorblock_preferences"

private def sb_raw_preferences
  JSON.parse(%({"unknown":{"keep":[1,true,null]},"chat_overlay_x":2.0,"sponsorblock_enabled":false,"sponsorblock_channel_overrides":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"name":"Latest name","enabled":false,"modes":{"sponsor":"manual","intro":"marker","future":"future-mode"},"native_future":{"keep":true}},"UCbbbbbbbbbbbbbbbbbbbbbb":{"name":"Other channel","enabled":null,"modes":{"future":"opaque"},"unknown":123}}})).as_h
end

describe "SponsorBlock web channel preference merge" do
  it "patches only one channel and keeps raw native/unrelated values without mutating its input" do
    stored = sb_raw_preferences
    original = stored.to_json
    entry = Invidious::SponsorBlock::ChannelOverride.new("Stale name", true, {"sponsor" => "auto"})
    result = Invidious::SponsorBlock.merge_channel_override(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", entry)
    stored.to_json.should eq(original)
    result["unknown"].should eq(stored["unknown"])
    result["chat_overlay_x"].should eq(stored["chat_overlay_x"])
    result["sponsorblock_enabled"].should eq(stored["sponsorblock_enabled"])
    result["sponsorblock_channel_overrides"]["UCbbbbbbbbbbbbbbbbbbbbbb"].should eq(stored["sponsorblock_channel_overrides"]["UCbbbbbbbbbbbbbbbbbbbbbb"])
    target = result["sponsorblock_channel_overrides"]["UCaaaaaaaaaaaaaaaaaaaaaa"]
    target["name"].as_s.should eq("Latest name")
    target["enabled"].as_bool.should be_true
    target["modes"]["sponsor"].as_s.should eq("auto")
    target["modes"].as_h.has_key?("intro").should be_false
    target["modes"]["future"].as_s.should eq("future-mode")
    target["native_future"].should eq(stored["sponsorblock_channel_overrides"]["UCaaaaaaaaaaaaaaaaaaaaaa"]["native_future"])
  end

  it "resets only the explicitly selected channel" do
    stored = sb_raw_preferences
    result = Invidious::SponsorBlock.merge_channel_override(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", nil)
    result["sponsorblock_channel_overrides"].as_h.has_key?("UCaaaaaaaaaaaaaaaaaaaaaa").should be_false
    result["sponsorblock_channel_overrides"]["UCbbbbbbbbbbbbbbbbbbbbbb"].should eq(stored["sponsorblock_channel_overrides"]["UCbbbbbbbbbbbbbbbbbbbbbb"])
    stored["sponsorblock_channel_overrides"].as_h.size.should eq(2)
    result["unknown"].should eq(stored["unknown"])
  end

  it "adds a named channel and keeps inheritance and repeated saves stable" do
    entry = Invidious::SponsorBlock::ChannelOverride.new("<New channel>", nil, {"intro" => "manual"})
    stored = Invidious::SponsorBlock.merge_channel_override(sb_raw_preferences, "UCcccccccccccccccccccccc", entry)
    stored["sponsorblock_channel_overrides"]["UCcccccccccccccccccccccc"]["enabled"].raw.should be_nil
    stored["sponsorblock_channel_overrides"]["UCcccccccccccccccccccccc"]["name"].as_s.should eq("<New channel>")
    Invidious::SponsorBlock.merge_channel_override(stored, "UCcccccccccccccccccccccc", entry).should eq(stored)
  end

  it "rejects an invalid channel or a mode outside the web editor's ownership" do
    stored = sb_raw_preferences
    entry = Invidious::SponsorBlock::ChannelOverride.new("Channel", true, {"future" => "auto"})
    expect_raises(ArgumentError) { Invidious::SponsorBlock.merge_channel_override(stored, "invalid", nil) }
    expect_raises(ArgumentError) { Invidious::SponsorBlock.merge_channel_override(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", entry) }
  end
end

it "keeps future channel fields when saving inheritance, but removes a wholly inherited known entry" do
  inherited = Invidious::SponsorBlock::ChannelOverride.new("Channel", nil, {} of String => String)
  stored = sb_raw_preferences
  result = Invidious::SponsorBlock.merge_channel_override(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", inherited)
  target = result["sponsorblock_channel_overrides"]["UCaaaaaaaaaaaaaaaaaaaaaa"]
  target["enabled"].raw.should be_nil
  target["modes"].as_h.keys.should eq(["future"])
  target["native_future"].should eq(stored["sponsorblock_channel_overrides"]["UCaaaaaaaaaaaaaaaaaaaaaa"]["native_future"])
  plain = JSON.parse(%({"sponsorblock_channel_overrides":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"name":"Channel","enabled":true,"modes":{"sponsor":"auto"}}}})).as_h
  Invidious::SponsorBlock.merge_channel_override(plain, "UCaaaaaaaaaaaaaaaaaaaaaa", inherited)["sponsorblock_channel_overrides"].as_h.should be_empty
end

it "does not replace an opaque malformed stored map with an empty map" do
  stored = JSON.parse(%({"sponsorblock_channel_overrides":"opaque"})).as_h
  expect_raises(ArgumentError) { Invidious::SponsorBlock.merge_channel_override(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", nil) }
  stored["sponsorblock_channel_overrides"].as_s.should eq("opaque")
end

it "limits new channel overrides without preventing an edit or explicit removal" do
  entries = (0...1000).to_h { |i| {"UC#{i.to_s.rjust(22, '0')}", JSON.parse(%({"name":"Channel","enabled":true,"modes":{}}))} }
  stored = {"sponsorblock_channel_overrides" => JSON::Any.new(entries)}
  entry = Invidious::SponsorBlock::ChannelOverride.new("Channel", true, {} of String => String)
  expect_raises(ArgumentError) { Invidious::SponsorBlock.merge_channel_override(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", entry) }
  Invidious::SponsorBlock.merge_channel_override(stored, "UC0000000000000000000000", entry)["sponsorblock_channel_overrides"].as_h.size.should eq(1000)
  Invidious::SponsorBlock.merge_channel_override(stored, "UC0000000000000000000000", nil)["sponsorblock_channel_overrides"].as_h.size.should eq(999)
end

it "rejects an opaque selected record or mode map until an explicit reset" do
  entry = Invidious::SponsorBlock::ChannelOverride.new("Channel", true, {"sponsor" => "auto"})
  [%({"sponsorblock_channel_overrides":{"UCaaaaaaaaaaaaaaaaaaaaaa":"future representation"}}), %({"sponsorblock_channel_overrides":{"UCaaaaaaaaaaaaaaaaaaaaaa":{"name":"Channel","modes":"future representation"}}})].each do |raw|
    stored = JSON.parse(raw).as_h
    expect_raises(ArgumentError) { Invidious::SponsorBlock.merge_channel_override(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", entry) }
    stored.to_json.should eq(JSON.parse(raw).to_json)
    Invidious::SponsorBlock.merge_channel_override(stored, "UCaaaaaaaaaaaaaaaaaaaaaa", nil)["sponsorblock_channel_overrides"].as_h.should be_empty
  end
end

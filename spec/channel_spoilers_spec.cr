require "spec"
require "../src/invidious/channel_spoilers"

describe Invidious::ChannelSpoilers do
  it "merges native channel deltas without replacing other rules or unknown preferences" do
    id = "UC" + "a" * 22
    other = "UC" + "b" * 22
    stored = JSON.parse({channel_spoiler_settings: {id => {name: "Studio", hide_title: true, hide_thumbnail: true, reveal_after_days: 7}, other => {name: "Other", hide_title: true, hide_thumbnail: false}}, future: {keep: true}}.to_json).as_h
    delta = JSON.parse({id => {hide_title: false, hide_thumbnail: true, reveal_after_days: nil}}.to_json)
    Invidious::ChannelSpoilers.validate_patch(delta)
    Invidious::ChannelSpoilers.merge_patch(stored, delta, {id => "Stale name"})
    rules = Invidious::ChannelSpoilers::Rules.normalize(stored["channel_spoiler_settings"])
    rules[id].name.should eq("Studio")
    rules[id].reveal_after_days.should be_nil
    rules.has_key?(other).should be_true
    stored["future"]["keep"].should eq(true)
    Invidious::ChannelSpoilers.merge_patch(stored, JSON.parse({id => nil}.to_json), {} of String => String)
    stored["channel_spoiler_settings"].as_h.has_key?(id).should be_false
    Invidious::ChannelSpoilers.merge_patch(stored, JSON.parse({other => {hide_title: false, hide_thumbnail: false}}.to_json), {} of String => String)
    stored["channel_spoiler_settings"].as_h.should be_empty
  end

  it "validates bounded distinct publication IDs" do
    Invidious::ChannelSpoilers.publication_ids("aaaaaaaaaaa,bbbbbbbbbbb").should eq(%w(aaaaaaaaaaa bbbbbbbbbbb))
    {nil, "", "invalid", "aaaaaaaaaaa,aaaaaaaaaaa", "aaaaaaaaaaa,", Array.new(101) { |i| i.to_s.rjust(11, '0') }.join(',')}.each do |ids|
      expect_raises(ArgumentError) { Invidious::ChannelSpoilers.publication_ids(ids) }
    end
  end
  it "hides until the exact shared upload-age boundary, including future uploads" do
    uploaded = Time.utc(2026, 10, 1, 12, 30)
    rule = Invidious::ChannelSpoilers::Rule.new("Channel", true, true, 7)
    rule.active?(uploaded, uploaded + 7.days - 1.second).should be_true
    rule.active?(uploaded, uploaded + 7.days).should be_false
    rule.active?(uploaded, uploaded + 8.days).should be_false
    rule.active?(uploaded, uploaded - 1.day).should be_true
    rule.active?(nil, uploaded + 100.days).should be_true
  end

  it "supports either switch, indefinite hiding and inactive rules" do
    uploaded = Time.utc(2020, 1, 1)
    Invidious::ChannelSpoilers::Rule.new("", true, false).active?(uploaded).should be_true
    Invidious::ChannelSpoilers::Rule.new("", false, true).active?(uploaded).should be_true
    Invidious::ChannelSpoilers::Rule.new.active?(nil).should be_false
  end

  it "emits an explicit null timer and accepts previously omitted timers" do
    id = "UC" + "a" * 22
    rule = Invidious::ChannelSpoilers::Rule.new("Channel", true, true)
    JSON.parse(rule.to_json).as_h.has_key?("reveal_after_days").should be_true
    JSON.parse(rule.to_json)["reveal_after_days"].raw.should be_nil
    ["", ",\"reveal_after_days\":null"].each do |timer|
      saved = Invidious::ChannelSpoilers::Rules.normalize(JSON.parse(%({"#{id}":{"hide_title":true,"hide_thumbnail":true#{timer}}})))[id]
      saved.reveal_after_days.should be_nil
      saved.active?(Time.utc(2010, 1, 1)).should be_true
    end
  end

  it "preserves timezone precision and rejects sentinel and synthetic publication dates" do
    Invidious::ChannelSpoilers.publication("2026-10-01T12:30:00+07:00").should eq(Time.utc(2026, 10, 1, 5, 30))
    Invidious::ChannelSpoilers.publication("2026-10-01").should eq(Time.utc(2026, 10, 1))
    {nil, "", "unknown", "1970-01-01"}.each { |value| Invidious::ChannelSpoilers.publication(value).should be_nil }
    info = JSON.parse(%({"published":"2026-10-01","publishedIsKnown":false})).as_h
    Invidious::ChannelSpoilers.video_publication(info).should be_nil
    info["publishedIsKnown"] = JSON::Any.new(true)
    Invidious::ChannelSpoilers.video_publication(info).should eq(Time.utc(2026, 10, 1))
  end

  it "normalizes rules without turning invalid timers into indefinite hiding" do
    id = "UC" + "a" * 22
    valid = {id => {"name" => "Channel <script>", "hide_title" => true, "hide_thumbnail" => false, "reveal_after_days" => 7}}
    rule = Invidious::ChannelSpoilers::Rules.normalize(JSON.parse(valid.to_json))[id]
    rule.reveal_after_days.should eq(7)
    rule.hide_title.should be_true
    rule.hide_thumbnail.should be_false
    Invidious::ChannelSpoilers::Rule.from_json(rule.to_json).should eq(rule)
    Invidious::ChannelSpoilers::Rule.from_yaml(rule.to_yaml).should eq(rule)
    ["0", "-1", "1.5", "\"7\"", "2147483648", "true"].each do |days|
      Invidious::ChannelSpoilers::Rules.normalize(JSON.parse(%({"#{id}":{"hide_title":true,"reveal_after_days":#{days}}}))).should be_empty
    end
    Invidious::ChannelSpoilers::Rules.normalize(JSON.parse(%({"invalid":{"hide_title":true},"#{id}":{"hide_title":false,"hide_thumbnail":false}}))).should be_empty
    Invidious::ChannelSpoilers::Rules.normalize(JSON.parse("null")).should be_empty
  end
end

require "spec"
require "../src/invidious/channel_spoilers"

describe Invidious::ChannelSpoilers do
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

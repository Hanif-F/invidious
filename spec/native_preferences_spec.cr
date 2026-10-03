require "spec"
require "../src/invidious/native_preferences"

describe Invidious::NativePreferences do
  it "accepts supported native settings, web caption names and SponsorBlock deltas together" do
    Invidious::NativePreferences.validate_patch(JSON.parse(%({
      "autoplay":false,"listen":true,"local":true,"speed":1.5,"quality_dash":"720p",
      "dark_mode":"dark","ui_density":"compact","thin_mode":true,"default_home":"Trending",
      "feed_menu":["Trending","Popular","Subscriptions","Playlists"],"region":"ID",
      "captions":["Indonesian","English (auto-generated)",""],"comments":["youtube","reddit"],
      "related_videos":false,"extend_desc":true,"max_results":60,"sort":"channel name",
      "latest_only":true,"unseen_only":true,"notifications_only":true,"default_playlist":null,
      "sponsorblock_modes":{"intro":"auto"}
    })).as_h)
    Invidious::NativePreferences.validate_patch(JSON.parse(%({"speed":1,"default_home":null})).as_h)
  end

  it "rejects unknown fields, wrong types and oversized/out-of-range settings" do
    invalid = ["{}", %({"theme":"diary"}), %({"autoplay":"false"}), %({"speed":0}), %({"speed":2.5}),
               %({"speed":"1"}), %({"quality_dash":"fake"}), %({"dark_mode":true}), %({"ui_density":"wide"}),
               %({"default_home":"History"}), %({"feed_menu":["Popular","bad"]}), %({"feed_menu":["","","","",""]}),
               %({"region":"id"}), %({"captions":["<script>"]}), %({"captions":["","","",""]}),
               %({"comments":["other"]}), %({"max_results":0}), %({"max_results":1501}), %({"max_results":1.5}),
               %({"sort":"views"}), %({"default_playlist":"../private"}), %({"sponsorblock_colors":{"intro":"red"}})]
    invalid.each { |body| expect_raises(Exception) { Invidious::NativePreferences.validate_patch(JSON.parse(body).as_h) } }
  end

  it "merges native values while preserving unknown preferences and nested SponsorBlock maps" do
    stored = JSON.parse(%({"theme":"diary","future":{"keep":true},"speed":1,"sponsorblock_modes":{"sponsor":"manual"}})).as_h
    patch = JSON.parse(%({"speed":1.5,"thin_mode":true,"sponsorblock_modes":{"intro":"auto"}})).as_h
    Invidious::NativePreferences.validate_patch(patch)
    Invidious::SponsorBlock.merge_patch(stored, patch, {} of String => String)
    stored["speed"].should eq(1.5)
    stored["thin_mode"].should eq(true)
    stored["theme"].should eq("diary")
    stored["future"]["keep"].should eq(true)
    stored["sponsorblock_modes"]["sponsor"].should eq("manual")
    stored["sponsorblock_modes"]["intro"].should eq("auto")
  end
end

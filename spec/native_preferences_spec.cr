require "spec"
require "../src/invidious/native_preferences"

describe Invidious::NativePreferences do
  it "validates native annotation and projection defaults as sparse booleans" do
    %w(annotations annotations_subscribed vr_mode).each do |key|
      {true, false}.each do |value|
        patch = JSON.parse({key => value}.to_json).as_h
        Invidious::NativePreferences.validate_patch(patch)
        stored = JSON.parse(%({"theme":"diary","future":42})).as_h
        Invidious::SponsorBlock.merge_patch(stored, patch, {} of String => String)
        stored[key].as_bool.should eq(value)
        stored["future"].as_i.should eq(42)
      end
      {"null", "1", %q("false")}.each do |value|
        expect_raises(Exception) { Invidious::NativePreferences.validate_patch(JSON.parse(%({"#{key}":#{value}})).as_h) }
      end
    end
  end

  it "accepts only boolean original-title choices" do
    {true, false}.each do |value|
      Invidious::NativePreferences.validate_patch(JSON.parse({show_original_title: value}.to_json).as_h)
    end
    {"null", "1", "\"false\""}.each do |value|
      expect_raises(Exception) do
        Invidious::NativePreferences.validate_patch(JSON.parse(%({"speed":1.5,"show_original_title":#{value}})).as_h)
      end
    end
  end
  it "accepts only supported integer seek intervals and preserves sparse saves" do
    Invidious::Videos::SeekPreferences::CHOICES.each do |seconds|
      patch = JSON.parse({seek_seconds: seconds}.to_json).as_h
      Invidious::NativePreferences.validate_patch(patch)
      saved = JSON.parse(%({"theme":"diary","future":true})).as_h
      Invidious::SponsorBlock.merge_patch(saved, patch, {} of String => String)
      Invidious::SponsorBlock.merge_patch(saved, JSON.parse(%({"speed":2})).as_h, {} of String => String)
      saved["seek_seconds"].as_i.should eq(seconds)
      saved["theme"].as_s.should eq("diary")
      saved["future"].as_bool.should be_true
    end
    {"0", "15", "-5", "31", "5.0", "5.5", "null", "true", %q("20"), "[]", "{}"}.each do |raw|
      expect_raises(Exception) { Invidious::NativePreferences.validate_patch(JSON.parse(%({"seek_seconds":#{raw}})).as_h) }
    end
  end
  it "accepts canonical preferred audio choices and preserves unrelated preferences" do
    (["original", "original_stable"] + Invidious::Videos::AudioPreferences::LANGUAGES.keys).each do |preference|
      patch = JSON.parse({"preferred_audio" => preference}.to_json).as_h
      Invidious::NativePreferences.validate_patch(patch)
      stored = JSON.parse(%({"theme":"diary","future":{"keep":true},"speed":1.5})).as_h
      Invidious::SponsorBlock.merge_patch(stored, patch, {} of String => String)
      stored["preferred_audio"].should eq(preference)
      stored["theme"].should eq("diary")
      stored["future"]["keep"].should eq(true)
      stored["speed"].should eq(1.5)
    end
  end

  it "rejects unsupported preferred audio tags and non-string values" do
    [%q(""), %q("unknown"), %q("en.4"), %q("PT_br"), %q("Original"), "null", "true", "123", "[]", "{}"].each do |value|
      expect_raises(Exception) do
        Invidious::NativePreferences.validate_patch(JSON.parse(%({"speed":1.5,"preferred_audio":#{value}})).as_h)
      end
    end
  end
  it "accepts complete channel spoiler deltas and rejects invalid patches atomically" do
    id = "UC" + "a" * 22
    ["null", %({"hide_title":true,"hide_thumbnail":false}), %({"hide_title":true,"hide_thumbnail":true,"reveal_after_days":null}), %({"hide_title":true,"hide_thumbnail":true,"reveal_after_days":2147483647})].each do |entry|
      Invidious::NativePreferences.validate_patch(JSON.parse(%({"channel_spoiler_settings":{"#{id}":#{entry}}})).as_h)
    end
    [%({"hide_title":"true","hide_thumbnail":false}), %({"hide_title":true}), %({"hide_title":true,"hide_thumbnail":false,"name":"Forged"}),
     %({"hide_title":true,"hide_thumbnail":true,"reveal_after_days":0}), %({"hide_title":true,"hide_thumbnail":true,"reveal_after_days":1.5}),
     %({"hide_title":true,"hide_thumbnail":true,"reveal_after_days":2147483648})].each do |entry|
      expect_raises(Exception) { Invidious::NativePreferences.validate_patch(JSON.parse(%({"speed":1.5,"channel_spoiler_settings":{"#{id}":#{entry}}})).as_h) }
    end
    expect_raises(Exception) { Invidious::NativePreferences.validate_patch(JSON.parse(%({"channel_spoiler_settings":{"invalid":null}})).as_h) }
  end
  it "accepts all canonical AI settings and rejects invalid values atomically" do
    data = JSON.parse(%({"ai_filter_enabled":false,"theme":"keep"})).as_h
    data.delete("theme")
    Invidious::NativePreferences::AI_ACTIONS.each do |key|
      data[key] = JSON::Any.new(key.ends_with?("other_pages_action") ? "replace_thumbnail" : "hide")
    end
    Invidious::NativePreferences.validate_patch(data)
    [%({"ai_filter_enabled":"true"}), %({"ai_warnlist_other_pages_action":"hide"}), %({"ai_blocklist_search_action":null}),
     %({"ai_blocklist_feeds_action":"invalid"}), %({"ai_warnlist_action":"hide"})].each do |body|
      expect_raises(Exception) { Invidious::NativePreferences.validate_patch(JSON.parse(body).as_h) }
    end
  end
  it "accepts every shared codec and preserves it through unrelated sparse patches" do
    {"auto", "av1", "h264"}.each do |codec|
      stored = JSON.parse(%({"video_codec":"auto","theme":"diary","future":{"keep":true}})).as_h
      patch = JSON.parse({"video_codec" => codec}.to_json).as_h
      Invidious::NativePreferences.validate_patch(patch)
      Invidious::SponsorBlock.merge_patch(stored, patch, {} of String => String)
      stored["video_codec"].should eq(codec)
      Invidious::SponsorBlock.merge_patch(stored, JSON.parse(%({"speed":1.5})).as_h, {} of String => String)
      stored["video_codec"].should eq(codec)
      stored["theme"].should eq("diary")
      stored["future"]["keep"].should eq(true)
    end
  end
  it "accepts supported native settings, web caption names and SponsorBlock deltas together" do
    Invidious::NativePreferences.validate_patch(JSON.parse(%({
      "autoplay":false,"continue":true,"continue_autoplay":false,"video_loop":true,"listen":true,"local":true,"speed":1.5,"quality_dash":"720p",
      "dark_mode":"dark","ui_density":"compact","thin_mode":true,"default_home":"Trending",
      "feed_menu":["Trending","Popular","Subscriptions","Playlists"],"region":"ID",
      "captions":["Indonesian","English (auto-generated)",""],"comments":["youtube","reddit"],
      "related_videos":false,"extend_desc":true,"show_member_videos":true,"max_results":60,"sort":"channel name",
      "latest_only":true,"unseen_only":true,"notifications_only":true,"default_playlist":null,
      "sponsorblock_modes":{"intro":"auto"}
    })).as_h)
    Invidious::NativePreferences.validate_patch(JSON.parse(%({"speed":1,"default_home":null})).as_h)
  end

  it "rejects unknown fields, wrong types and oversized/out-of-range settings" do
    invalid = ["{}", %({"continue":"true"}), %({"continue_autoplay":null}), %({"video_loop":1}), %({"show_member_videos":"false"}), %({"show_member_videos":null}), %({"theme":"diary"}), %({"autoplay":"false"}), %({"speed":0}), %({"speed":2.5}),
               %({"speed":"1"}), %({"quality_dash":"fake"}), %({"video_codec":"vp9"}), %({"video_codec":"AV1"}), %({"video_codec":""}),
               %({"video_codec":null}), %({"video_codec":true}), %({"video_codec":123}), %({"video_codec":{}}), %({"video_codec":[]}),
               %({"dark_mode":true}), %({"ui_density":"wide"}),
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

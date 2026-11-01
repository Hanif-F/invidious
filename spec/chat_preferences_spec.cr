require "spec"
require "../src/invidious/chat_preferences"

private def chat_patch(json)
  JSON.parse(json).as_h
end

describe Invidious::ChatPreferences do
  it "retains native/API field ranges including both boundaries" do
    {"chat_font_scale" => {75, 150}, "chat_width_px" => {280, 640}, "chat_overlay_opacity" => {0, 100}, "chat_overlay_x" => {0, 1000}, "chat_overlay_y" => {0, 1000}, "chat_overlay_width" => {1, 1000}, "chat_overlay_height" => {1, 1000}}.each do |key, bounds|
      bounds.each { |value| Invidious::ChatPreferences.validate_patch(chat_patch({key => value}.to_json)) }
      {bounds[0] - 1, bounds[1] + 1}.each do |value|
        expect_raises(ArgumentError) { Invidious::ChatPreferences.validate_patch(chat_patch({key => value}.to_json)) }
      end
    end
  end

  it "rejects empty, unknown, null, coerced and wrong-type writes" do
    [%({}), %({"private_id":"secret"}), %({"chat_hide_user_ids":true}), %({"chat_font_scale":"100"}), %({"chat_width_px":400.5}), %({"chat_show_timestamps":null}), %({"chat_show_timestamps":1}), %({"chat_word_blacklist":[]})].each do |json|
      expect_raises(ArgumentError) { Invidious::ChatPreferences.validate_patch(chat_patch(json)) }
    end
  end

  it "uses UTF-8 bytes for the unchanged native filter limit" do
    Invidious::ChatPreferences.validate_patch(chat_patch({"chat_word_blacklist" => "é" * 512}.to_json))
    expect_raises(ArgumentError) { Invidious::ChatPreferences.validate_patch(chat_patch({"chat_word_blacklist" => "é" * 513}.to_json)) }
    Invidious::ChatPreferences.validate_patch(chat_patch(%({"chat_user_blacklist":"","chat_show_timestamps":false,"chat_overlay_mode":false})))
  end

  it "retains latest unrelated, retired overlay, sparse and unknown raw values" do
    stored = chat_patch(%({"dark_mode":"light","future_native":{"nested":[1,true]},"chat_overlay_mode":true,"chat_overlay_opacity":0,"chat_overlay_x":550,"chat_overlay_width":400}))
    original = stored.to_json
    merged = Invidious::ChatPreferences.merge_patch(stored, chat_patch(%({"chat_show_timestamps":false,"chat_word_blacklist":"literal /spam/"})))
    stored.each { |key, value| merged[key].should eq(value) }
    merged["chat_show_timestamps"].as_bool.should be_false
    merged["chat_word_blacklist"].as_s.should eq("literal /spam/")
    merged.size.should eq(stored.size + 2)
    stored.to_json.should eq(original)
  end

  it "checks complete geometry against the latest proposed values only for a geometry write" do
    patch = chat_patch(%({"chat_overlay_width":400}))
    Invidious::ChatPreferences.validate_geometry(patch, 600, 0, 400, 1000)
    expect_raises(ArgumentError) { Invidious::ChatPreferences.validate_geometry(patch, 601, 0, 400, 1000) }
    expect_raises(ArgumentError) { Invidious::ChatPreferences.validate_geometry(patch, 0, 300, 400, 701) }
    Invidious::ChatPreferences.validate_geometry(chat_patch(%({"chat_show_timestamps":true})), 900, 900, 400, 750)
  end
end

require "spec"
require "../src/invidious/web_preferences"

private def web_preferences_parse(section, form, previous = "{}")
  Invidious::WebPreferences.parse(section, URI::Params.parse(form), JSON.parse(previous).as_h, %w(en-US id ar))
end

describe Invidious::WebPreferences do
  it "rejects unknown and dedicated categories before interpreting the form" do
    {"", "unknown", "chat", "blocked-channels", "channel-visibility", "admin", "appearance/../admin"}.each do |section|
      expect_raises(Invidious::WebPreferences::InvalidField) { web_preferences_parse(section, "dark_mode=light") }
    end
  end

  it "has one category owner for every editable field, excluding dedicated and retired fields" do
    editable = Invidious::WebPreferences::SECTIONS.values.flatten
    editable.uniq.should eq(editable)
    (editable & Invidious::WebPreferences::PRESERVED_ONLY).should be_empty
    (editable & Invidious::WebPreferences::DEDICATED.values.flatten).should be_empty
    editable.should_not contain("private_id")
    editable.should_not contain("sponsorblock_channel_overrides")
  end

  it "restricts omitted checkboxes to their category and ignores cross-category inputs" do
    patch = web_preferences_parse("appearance", "dark_mode=light&autoplay=on&thin_mode=off&private_id=ignored")
    patch.keys.sort.should eq(%w(dark_mode show_nick))
    patch["show_nick"].as_bool.should be_false
    patch["dark_mode"].as_s.should eq("light")
    web_preferences_parse("appearance", "show_nick=on").has_key?("dark_mode").should be_false
    expect_raises(Invidious::WebPreferences::InvalidField) { web_preferences_parse("appearance", "show_nick=maybe") }
  end

  it "preserves other categories, native retirement fields, unknown data and private endpoint state" do
    stored = JSON.parse(%({"dark_mode":"dark","show_nick":true,"speed":1.5,"thin_mode":true,"ui_density":"compact","player_style":"youtube","chat_overlay_mode":true,"channel_spoiler_settings":{"UCkeep":{"hide_title":true}},"sponsorblock_channel_overrides":{"UCkeep":{"enabled":false}},"future":{"keep":[1,2]}})).as_h
    canonical = JSON.parse(%({"dark_mode":"light","show_nick":false,"speed":1,"thin_mode":false,"future":"discarded by typed model"})).as_h
    result = Invidious::WebPreferences.merge("appearance", stored, canonical)
    result["dark_mode"].as_s.should eq("light")
    result["show_nick"].as_bool.should be_false
    stored.each { |key, value| result[key].should eq(value) unless %w(dark_mode show_nick).includes?(key) }
    stored["dark_mode"].as_s.should eq("dark")
    Invidious::WebPreferences.values("appearance", result).keys.sort.should eq(%w(dark_mode show_nick))
  end

  it "clears nullable owned values even when the canonical serializer omits nil fields" do
    stored = JSON.parse(%({"timezone":"Asia/Jakarta","default_playlist":"IVkeep","speed":1.5})).as_h
    result = Invidious::WebPreferences.merge("language", stored, {} of String => JSON::Any)
    result["timezone"].raw.should be_nil
    result["default_playlist"].as_s.should eq("IVkeep")
    Invidious::WebPreferences.values("language", result)["timezone"].raw.should be_nil
    library = Invidious::WebPreferences.merge("library", stored, {} of String => JSON::Any)
    library["default_playlist"].raw.should be_nil
  end

  it "validates complete scalar patches atomically without modifying the previous object" do
    previous = JSON.parse(%({"locale":"en-US","region":"ID","timezone":"Asia/Jakarta"})).as_h
    expect_raises(Invidious::WebPreferences::InvalidField) do
      Invidious::WebPreferences.parse("language", URI::Params.parse("locale=id&timezone=Not/AZone"), previous, %w(en-US id))
    end
    previous["locale"].as_s.should eq("en-US")
    web_preferences_parse("language", "locale=id&region=ID&timezone=Asia%2FJakarta")["timezone"].as_s.should eq("Asia/Jakarta")
    web_preferences_parse("language", "timezone=&region=").values.all?(&.raw.nil?).should be_true
    {"locale=unknown", "region=id", "timezone=Not/AZone"}.each do |body|
      expect_raises(Invidious::WebPreferences::InvalidField) { web_preferences_parse("language", body) }
    end
  end

  it "validates numeric settings rather than silently clamping or accepting nonfinite input" do
    {"speed=NaN", "speed=Infinity", "speed=0", "speed=3", "seek_seconds=11", "seek_seconds=10.5", "video_codec=vp9", "quality=unknown"}.each do |body|
      expect_raises(Invidious::WebPreferences::InvalidField) { web_preferences_parse("playback", body) }
    end
    patch = web_preferences_parse("playback", "speed=1.5&seek_seconds=20&quality=dash&video_codec=av1&preferred_audio=original_stable")
    patch["speed"].as_f.should eq(1.5)
    patch["seek_seconds"].as_i.should eq(20)
    {"max_results=0", "max_results=1501", "sort=unknown"}.each do |body|
      expect_raises(Invidious::WebPreferences::InvalidField) { web_preferences_parse("library", body) }
    end
  end

  it "preserves omitted array positions while allowing explicitly cleared priorities" do
    patch = web_preferences_parse("captions-comments", "captions%5B1%5D=Indonesian&comments%5B0%5D=reddit", %({"captions":["English","French","German"],"comments":["youtube",""]}))
    patch["captions"].as_a.map(&.as_s).should eq(%w(English Indonesian German))
    patch["comments"].as_a.map(&.as_s).should eq(["reddit", ""])
    cleared = web_preferences_parse("browsing", "feed_menu%5B0%5D=&feed_menu%5B1%5D=&feed_menu%5B2%5D=&feed_menu%5B3%5D=", %({"feed_menu":["Popular","Trending"]}))
    cleared["feed_menu"].as_a.should be_empty
    web_preferences_parse("browsing", "default_home=Popular").has_key?("feed_menu").should be_false
    expect_raises(Invidious::WebPreferences::InvalidField) { web_preferences_parse("captions-comments", "comments%5B0%5D=unknown") }
  end

  it "keeps unknown enhancement map entries and validates only deliberate category edits" do
    previous = %({"sponsorblock_modes":{"sponsor":"manual","future-category":"future-mode"},"sponsorblock_colors":{"sponsor":"#123456","future-category":"#abcdef"}})
    patch = web_preferences_parse("sponsorblock", "sponsorblock_enabled=on&sponsorblock_mode_sponsor=auto&sponsorblock_color_sponsor=%23aabbcc", previous)
    patch["sponsorblock_modes"]["future-category"].as_s.should eq("future-mode")
    patch["sponsorblock_modes"]["sponsor"].as_s.should eq("auto")
    merged = Invidious::WebPreferences.merge("sponsorblock", JSON.parse(previous).as_h, JSON.parse(%({"sponsorblock_modes":{"sponsor":"auto"},"sponsorblock_colors":{"sponsor":"#aabbcc"}})).as_h)
    merged["sponsorblock_colors"]["future-category"].as_s.should eq("#abcdef")
    {"sponsorblock_mode_sponsor=guess", "sponsorblock_color_sponsor=red"}.each do |body|
      expect_raises(Invidious::WebPreferences::InvalidField) { web_preferences_parse("sponsorblock", body, previous) }
    end
  end

  it "supports all eight canonical AI actions without permitting discovery hiding in library surfaces" do
    Invidious::NativePreferences::AI_ACTIONS.each do |field|
      modes = field.ends_with?("_other_pages_action") ? %w(off replace_thumbnail) : %w(off hide replace_thumbnail)
      modes.each { |mode| web_preferences_parse("ai-filter", "#{field}=#{mode}")[field].as_s.should eq(mode) }
    end
    expect_raises(Invidious::WebPreferences::InvalidField) { web_preferences_parse("ai-filter", "ai_warnlist_other_pages_action=hide") }
  end
end

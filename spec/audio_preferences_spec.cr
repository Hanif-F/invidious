require "spec"
require "../src/invidious/videos/audio_preferences"

private def audio_format(tag, bitrate = 128000, original = false, stable = false, itag = 140)
  JSON.parse({itag: itag, bitrate: bitrate, mimeType: "audio/mp4", isDrc: stable,
              audioTrack: {id: tag, displayName: tag, audioIsDefault: original}}.to_json).as_h
end

describe Invidious::Videos::AudioPreferences do
  it "normalizes supported language tags and rejects unrelated values" do
    {"original", "original_stable", "id", "pt-BR", "es-419", "zh-Hans"}.each do |value|
      Invidious::Videos::AudioPreferences.normalize(value).should eq(value)
    end
    Invidious::Videos::AudioPreferences.normalize("PT_br").should eq("pt-BR")
    [nil, "", "unknown", "<script>", "en.4"].each do |value|
      Invidious::Videos::AudioPreferences.normalize(value).should eq("original")
    end
  end

  it "selects original, DRC and languages independently of duplicate itags" do
    original = audio_format("en-US.4", original: true)
    stable = audio_format("en-US.4", original: true, stable: true)
    dub = audio_format("id.3", 96000)
    streams = [dub, stable, original]
    {"original" => original, "original_stable" => stable, "id" => dub, "en" => original,
     "fr" => original, "en-GB" => original}.each do |preference, expected|
      Invidious::Videos::AudioPreferences.select(streams, preference).should eq([expected])
    end
    Invidious::Videos::AudioPreferences.select([dub, original], "original_stable").should eq([original])
    Invidious::Videos::AudioPreferences.resolve(streams, 140, "id.3", false).should eq(dub)
    Invidious::Videos::AudioPreferences.resolve(streams, 140, "en-US.4", true).should eq(stable)
    Invidious::Videos::AudioPreferences.resolve(streams, 140, "fr.3", false).should eq(original)
  end

  it "requires exact regional choices and accepts regional tracks for a general language" do
    original = audio_format("en.4", original: true)
    brazil = audio_format("pt-BR.3")
    portugal = audio_format("pt-PT.3")
    streams = [original, brazil, portugal]
    Invidious::Videos::AudioPreferences.select(streams, "pt-BR").should eq([brazil])
    Invidious::Videos::AudioPreferences.select(streams, "pt").should eq([brazil, portugal])
    Invidious::Videos::AudioPreferences.select([original, portugal], "pt-BR").should eq([original])
  end

  it "recognizes unlabeled DRC copies and retains old metadata-free audio" do
    original = audio_format("en.4", original: true)
    stable = audio_format("en.10", stable: true)
    stable.delete("isDrc")
    stable["url"] = JSON::Any.new("https://media.test/videoplayback?xtags=acont%3Ddrc")
    Invidious::Videos::AudioPreferences.select([original, stable], "original_stable").should eq([stable])
    legacy = JSON.parse(%({"itag":140,"bitrate":128000,"mimeType":"audio/mp4"})).as_h
    Invidious::Videos::AudioPreferences.select([legacy], "id").should eq([legacy])
    Invidious::Videos::AudioPreferences.select([] of Hash(String, JSON::Any), "id").should be_empty
  end

  it "keeps M4A first and chooses the highest bitrate within the chosen track group" do
    low = audio_format("id.3", 64000)
    high = audio_format("id.3", 128000)
    webm = audio_format("id.3", 160000, itag: 251)
    webm["mimeType"] = JSON::Any.new("audio/webm")
    Invidious::Videos::AudioPreferences.best([webm, low, high]).should eq(high)
    Invidious::Videos::AudioPreferences.resolve([webm, low, high], 251, "id.3", false).should eq(webm)
  end
end

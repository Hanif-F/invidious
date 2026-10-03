require "spec"
require "../src/invidious/videos/audio_metadata"

describe Invidious::Videos::AudioMetadata do
  it "serializes original and dubbed identities without upstream private fields" do
    {true, false}.each do |default|
      fmt = JSON.parse(%({"audioTrack":{"id":"en.1","displayName":"English","audioIsDefault":#{default},"private":"omit"}})).as_h
      data = JSON.parse(JSON.build { |json| json.object { Invidious::Videos::AudioMetadata.write(json, fmt) } })
      data["audioTrack"]["audioIsDefault"].should eq(default)
      data["audioTrack"]["id"].should eq("en.1")
      data["audioTrack"].as_h.has_key?("private").should be_false
      data["isDrc"].should eq(false)
    end
  end

  it "shares manifest stable-volume detection for flags, labels and encoded URLs" do
    [%({"isDrc":true}), %({"audioTrack":{"displayName":"English Stable Volume"}}),
     %({"url":"https://media.test/videoplayback?acont%3Ddrc"})].each do |body|
      Invidious::Videos::AudioMetadata.stable_volume?(JSON.parse(body).as_h).should be_true
    end
  end

  it "accepts absent or malformed optional metadata without inventing an identity" do
    [{"isDrc" => JSON::Any.new(false)}, JSON.parse(%({"audioTrack":null,"url":"%invalid"})).as_h].each do |fmt|
      data = JSON.parse(JSON.build { |json| json.object { Invidious::Videos::AudioMetadata.write(json, fmt) } })
      data["isDrc"].should eq(false)
      data.as_h.has_key?("audioTrack").should be_false
    end
  end
end

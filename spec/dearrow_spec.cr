require "spec"
require "../src/invidious/dearrow"

private def branding(title = "A >clear title", original = false, votes = 0, locked = false)
  {"abcdefghijk" => {titles: [{title: title, original: original, votes: votes, locked: locked}]}}.to_json
end

describe Invidious::DeArrow do
  it "validates IDs before fetching" do
    calls = 0
    client = Invidious::DeArrow::Client.new(->(id : String) { calls += 1; Invidious::DeArrow::Result.new("title", 1.hour) })
    {"", "short", "abcdefghijk?", "../abcdefgh", "abcdefghij\n"}.each { |id| client.title(id).should be_nil }
    calls.should eq(0)
    Invidious::DeArrow.valid_id?("abc_DEF-12").should be_false
    Invidious::DeArrow.valid_id?("abc_DEF-123").should be_true
  end

  it "uses only the highest-ranked trusted non-original title" do
    Invidious::DeArrow.parse(branding, "abcdefghijk").should eq("A clear title")
    Invidious::DeArrow.parse(branding(original: true), "abcdefghijk").should be_nil
    Invidious::DeArrow.parse(branding(votes: -1), "abcdefghijk").should be_nil
    Invidious::DeArrow.parse(branding(votes: -1, locked: true), "abcdefghijk").should eq("A clear title")
    Invidious::DeArrow.parse(branding(title: " > "), "abcdefghijk").should be_nil
    Invidious::DeArrow.parse(branding, "other_video").should be_nil
    Invidious::DeArrow.parse(%({"abcdefghijk":{"titles":[]}}), "abcdefghijk").should be_nil
    data = JSON.parse(branding(original: true))
    data["abcdefghijk"]["titles"].as_a << JSON.parse(branding)["abcdefghijk"]["titles"][0]
    Invidious::DeArrow.parse(data.to_json, "abcdefghijk").should be_nil
  end

  it "maps upstream status codes to fallback and cache lifetimes" do
    {200 => 1.hour, 404 => 10.minutes, 429 => 30.seconds, 500 => 30.seconds}.each do |status, ttl|
      result = Invidious::DeArrow.result(HTTP::Client::Response.new(status, body: branding), "abcdefghijk")
      result.ttl.should eq(ttl)
      result.title.should eq(status == 200 ? "A clear title" : nil)
    end
    result = Invidious::DeArrow.result(HTTP::Client::Response.new(200, body: "{}"), "abcdefghijk")
    result.title.should be_nil
    result.ttl.should eq(10.minutes)
  end

  it "caches successes and missing titles until their TTL expires" do
    {Invidious::DeArrow::Result.new("title", 1.hour), Invidious::DeArrow::Result.new(nil, 10.minutes)}.each do |result|
      calls = 0
      now = 0.seconds
      client = Invidious::DeArrow::Client.new(->(id : String) { calls += 1; result }, -> { now })
      2.times { client.title("abcdefghijk").should eq(result.title) }
      calls.should eq(1)
      now += result.ttl
      client.title("abcdefghijk")
      calls.should eq(2)
    end
  end

  it "briefly caches malformed responses and transport errors" do
    {"{", %({"abcdefghijk":{"titles":false}}), "timeout"}.each do |body|
      now = 0.seconds
      calls = 0
      client = Invidious::DeArrow::Client.new(->(id : String) {
        calls += 1
        raise IO::TimeoutError.new("timeout") if body == "timeout"
        Invidious::DeArrow::Result.new(Invidious::DeArrow.parse(body, id), 1.hour)
      }, -> { now })
      2.times { client.title("abcdefghijk").should be_nil }
      calls.should eq(1)
      now += 30.seconds
      client.title("abcdefghijk").should be_nil
      calls.should eq(2)
    end
  end

  it "bounds cached entries" do
    calls = 0
    client = Invidious::DeArrow::Client.new(->(id : String) { calls += 1; Invidious::DeArrow::Result.new(id, 1.hour) }, capacity: 2)
    {"aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "aaaaaaaaaaa"}.each { |id| client.title(id) }
    calls.should eq(4)
  end

  it "deduplicates concurrent lookups and limits upstream concurrency to four" do
    calls = 0
    active = 0
    peak = 0
    client = Invidious::DeArrow::Client.new(->(id : String) {
      calls += 1
      active += 1
      peak = Math.max(peak, active)
      Fiber.yield
      active -= 1
      Invidious::DeArrow::Result.new(id, 1.hour)
    })
    done = Channel(String?).new(20)
    20.times do |i|
      id = i.even? ? "abcdefghijk" : i.to_s.rjust(11, '0')
      spawn { done.send(client.title(id)) }
    end
    20.times { done.receive.should_not be_nil }
    calls.should eq(11)
    peak.should eq(4)
  end
end

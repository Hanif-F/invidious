require "spec"
require "../src/invidious/original_titles"

private alias OriginalTitles = Invidious::OriginalTitles

private class OriginalTitleTestClock
  property now : Time = Time.utc
end

describe OriginalTitles do
  it "preserves Unicode and literal punctuation from oEmbed" do
    title = "日本語 <原題> & café 🎬"
    result = OriginalTitles.result(HTTP::Client::Response.new(200, body: {title: title}.to_json))
    result.title.should eq(title)
    result.ttl.should eq(6.hours)
  end

  it "distinguishes unavailable titles from transient failures" do
    {401 => 10.minutes, 403 => 10.minutes, 404 => 10.minutes, 429 => 30.seconds, 500 => 30.seconds}.each do |status, ttl|
      result = OriginalTitles.result(HTTP::Client::Response.new(status))
      result.title.should be_nil
      result.ttl.should eq(ttl)
    end
    {"{}", %({"title":" "})}.each do |body|
      OriginalTitles.result(HTTP::Client::Response.new(200, body: body)).ttl.should eq(10.minutes)
    end
    OriginalTitles.result(HTTP::Client::Response.new(200, body: "{")).ttl.should eq(30.seconds)
    {% for value in {123, "bad\u0000title"} %}
      OriginalTitles.result(HTTP::Client::Response.new(200, body: {title: {{ value }}}.to_json)).ttl.should eq(30.seconds)
    {% end %}
  end

  it "deduplicates IDs, rejects invalid IDs and batches durable reads" do
    reads = [] of Array(String)
    calls = [] of String
    client = OriginalTitles::Client.new(
      ->(id : String) { calls << id; OriginalTitles::Result.new("日本語", 6.hours) },
      ->(ids : Array(String)) { reads << ids; {"aaaaaaaaaaa" => OriginalTitles::Entry.new("Français", Time.utc + 1.hour)} })
    titles = client.resolve(["aaaaaaaaaaa", "bbbbbbbbbbb", "bbbbbbbbbbb", "../invalid"], OriginalTitles.clock + 1.second)
    reads.should eq([["aaaaaaaaaaa", "bbbbbbbbbbb"]])
    calls.should eq(["bbbbbbbbbbb"])
    titles.should eq({"aaaaaaaaaaa" => "Français", "bbbbbbbbbbb" => "日本語"})
    client.resolve(["aaaaaaaaaaa", "bbbbbbbbbbb"], OriginalTitles.clock + 1.second)
    reads.size.should eq(1)
    calls.size.should eq(1)
  end

  it "expires successes, negative entries and transport failures" do
    {OriginalTitles::Result.new("Original", 6.hours), OriginalTitles::Result.new(nil, 10.minutes)}.each do |result|
      wall_clock = OriginalTitleTestClock.new
      calls = 0
      client = OriginalTitles::Client.new(->(_id : String) { calls += 1; result }, now: -> { wall_clock.now })
      2.times { client.resolve(["aaaaaaaaaaa"], OriginalTitles.clock + 1.second) }
      calls.should eq(1)
      wall_clock.now += result.ttl
      client.resolve(["aaaaaaaaaaa"], OriginalTitles.clock + 1.second)
      calls.should eq(2)
    end
    failure_clock = OriginalTitleTestClock.new
    failure_calls = 0
    client = OriginalTitles::Client.new(->(_id : String) : OriginalTitles::Result { failure_calls += 1; raise IO::TimeoutError.new("timeout") }, now: -> { failure_clock.now })
    2.times { client.resolve(["aaaaaaaaaaa"], OriginalTitles.clock + 1.second)["aaaaaaaaaaa"].should be_nil }
    failure_calls.should eq(1)
    failure_clock.now += 30.seconds
    client.resolve(["aaaaaaaaaaa"], OriginalTitles.clock + 1.second)
    failure_calls.should eq(2)
  end

  it "isolates cache failures and keeps bounded memory entries" do
    calls = 0
    client = OriginalTitles::Client.new(
      ->(id : String) { calls += 1; OriginalTitles::Result.new(id, 6.hours) },
      ->(_ids : Array(String)) : Hash(String, OriginalTitles::Entry) { raise "offline" },
      ->(_id : String, _entry : OriginalTitles::Entry) : Nil { raise "offline" }, capacity: 2)
    %w(aaaaaaaaaaa bbbbbbbbbbb ccccccccccc aaaaaaaaaaa).each do |id|
      client.resolve([id], OriginalTitles.clock + 1.second)[id].should eq(id)
    end
    calls.should eq(4)
  end

  it "coalesces concurrent requests and limits network work to four" do
    calls = 0
    active = 0
    peak = 0
    client = OriginalTitles::Client.new(->(id : String) {
      calls += 1
      active += 1
      peak = Math.max(peak, active)
      sleep 5.milliseconds
      active -= 1
      OriginalTitles::Result.new(id, 6.hours)
    })
    done = Channel(Nil).new
    3.times do
      spawn do
        client.resolve(%w(aaaaaaaaaaa bbbbbbbbbbb ccccccccccc ddddddddddd eeeeeeeeeee), OriginalTitles.clock + 1.second)
        done.send(nil)
      end
    end
    3.times { done.receive }
    calls.should eq(5)
    peak.should eq(4)
  end

  it "bounds response latency and stops queued work at the deadline" do
    calls = 0
    client = OriginalTitles::Client.new(->(id : String) {
      calls += 1
      sleep 60.milliseconds
      OriginalTitles::Result.new(id, 6.hours)
    })
    started = OriginalTitles.clock
    titles = client.resolve(%w(aaaaaaaaaaa bbbbbbbbbbb ccccccccccc ddddddddddd eeeeeeeeeee), started + 15.milliseconds)
    (OriginalTitles.clock - started).should be < 50.milliseconds
    titles.values.should eq([nil, nil, nil, nil, nil])
    sleep 80.milliseconds
    calls.should eq(4)
    # Completed in-flight lookups can still populate the shared cache.
    client.resolve(["aaaaaaaaaaa"], OriginalTitles.clock + 1.second)["aaaaaaaaaaa"].should eq("aaaaaaaaaaa")
    calls.should eq(4)
  end

  it "includes optional database reads and writes in the response budget" do
    calls = 0
    slow_read = OriginalTitles::Client.new(
      ->(_id : String) { calls += 1; OriginalTitles::Result.new("Original", 6.hours) },
      ->(_ids : Array(String)) { sleep 100.milliseconds; {} of String => OriginalTitles::Entry })
    started = OriginalTitles.clock
    slow_read.resolve(["aaaaaaaaaaa"], started + 15.milliseconds)["aaaaaaaaaaa"].should be_nil
    (OriginalTitles.clock - started).should be < 80.milliseconds
    calls.should eq(0)
    slow_write = OriginalTitles::Client.new(
      ->(_id : String) { OriginalTitles::Result.new("Original", 6.hours) },
      save: ->(_id : String, _entry : OriginalTitles::Entry) { sleep 100.milliseconds })
    started = OriginalTitles.clock
    slow_write.resolve(["aaaaaaaaaaa"], started + 15.milliseconds)["aaaaaaaaaaa"].should eq("Original")
    (OriginalTitles.clock - started).should be < 80.milliseconds
    sleep 110.milliseconds
  end

  it "selects nested video titles without changing custom names or descriptions" do
    value = JSON.parse(%({"playlistId":"PLtest","title":"My playlist","description":"translated","videos":[{"videoId":"aaaaaaaaaaa","title":"translated"}],"clips":[{"clipId":"custom","clipTitle":"My clip","video":{"videoId":"bbbbbbbbbbb","title":"translated"}}],"entries":[{"video_id":"ccccccccccc","title":"translated"}],"channel":{"authorId":"UCtest","title":"My channel"}}))
    records = OriginalTitles.records(value)
    OriginalTitles.apply(records, {"aaaaaaaaaaa" => "日本語".as(String?), "bbbbbbbbbbb" => "Français".as(String?), "ccccccccccc" => nil})
    value["title"].should eq("My playlist")
    value["description"].should eq("translated")
    value["videos"][0]["title"].should eq("日本語")
    value["clips"][0]["clipTitle"].should eq("My clip")
    value["clips"][0]["video"]["title"].should eq("Français")
    value["entries"][0]["title"].should eq("translated")
    value["channel"]["title"].should eq("My channel")
  end
end

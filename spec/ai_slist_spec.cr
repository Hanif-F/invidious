require "spectator"
require "../src/invidious/ai_slist"

private class AiListMemoryStorage < Invidious::AiSList::Storage
  getter lists = {} of String => Tuple(String, Time)
  getter handles = {} of String => Invidious::AiSList::HandleEntry
  property fail_writes = false

  def load_lists : Hash(String, Tuple(String, Time))
    @lists.dup
  end

  def save_list(kind : String, body : String, updated_at : Time) : Nil
    raise "Storage unavailable" if fail_writes
    @lists[kind] = {body, updated_at}
  end

  def load_handles(ids : Array(String)) : Hash(String, Invidious::AiSList::HandleEntry)
    @handles.select { |id, _| ids.includes?(id) }
  end

  def save_handles(entries : Hash(String, Invidious::AiSList::HandleEntry)) : Nil
    raise "Storage unavailable" if fail_writes
    entries.each do |id, entry|
      @handles[id] = entry unless @handles[id]?.try { |old| old.checked_at > entry.checked_at }
    end
  end
end

Spectator.describe Invidious::AiSList do
  it "parses comments, CRLF, Unicode/encoded handles, IDs and duplicates" do
    list = described_class.parse("\uFEFF! Title\r\n\n@Example\r\n@example\n@Caf%C3%A9\n@Cafe\u0301\nUC#{"a" * 22}\n")
    expect(list.size).to eq(3)
    expect(list.handles).to eq(Set{"@example", "@café"})
    expect(list.includes?("UC#{"a" * 22}", nil)).to be_true
    expect(list.includes?("UC#{"b" * 22}", "@example")).to be_true
    expect(list.includes?("", "@example_extra")).to be_false
    expect(described_class.parse("! Total Channels: 0\n").size).to eq(0)
  end

  it "rejects malformed, empty and oversized downloads" do
    ["", "! Comments only\n", "<html>Bad gateway</html>", "UCwrong", "@good\ninvalid", "@a\n" * 800_000].each do |body|
      expect { described_class.parse(body) }.to raise_error(ArgumentError)
    end
  end

  it "extracts handles only from endpoints linked to the exact channel ID" do
    id = "UC#{"a" * 22}"
    endpoint = JSON.parse({navigationEndpoint: {browseEndpoint: {browseId: id, canonicalBaseUrl: "/@Creator"}}}.to_json)
    expect(described_class.author_handle(endpoint, id)).to eq("@creator")
    expect(described_class.author_handle(endpoint, "UC#{"b" * 22}")).to be_nil
    expect(described_class.author_handle(JSON.parse({text: "@Creator", description: "/@Creator"}.to_json), id)).to be_nil
    expect(described_class.handle_url("https://evil.test/@Creator")).to be_nil
    expect(described_class.handle_url("https://www.youtube.com/@Creator")).to eq("@creator")
    conflict = JSON.parse([{browseEndpoint: {browseId: id, canonicalBaseUrl: "/@One"}}, {browseEndpoint: {browseId: id, canonicalBaseUrl: "/@Two"}}].to_json)
    expect(described_class.author_handle(conflict, id)).to be_nil
  end

  it "checks channel metadata identity before using any canonical handle URL" do
    id = "UC#{"a" * 22}"
    data = JSON.parse({metadata: {channelMetadataRenderer: {externalId: id, channelUrl: "https://www.youtube.com/@Canonical"}}}.to_json).as_h
    expect(described_class.channel_handle(data, id)).to eq("@canonical")
    expect(described_class.channel_handle(data, "UC#{"b" * 22}")).to be_nil
    data["metadata"]["channelMetadataRenderer"].as_h["channelUrl"] = JSON::Any.new("https://evil.test/@Canonical")
    expect(described_class.channel_handle(data, id)).to be_nil
  end
end

Spectator.describe Invidious::AiSList::Lists do
  it "refreshes lists independently and keeps the last successful snapshot on malformed responses" do
    storage = AiListMemoryStorage.new
    bodies = {"blocklist" => "@Blocked", "warnlist" => "@Warned"}
    now = Time.utc(2026, 10, 9)
    lists = described_class.new(storage, ->(kind : String) { bodies[kind] }, -> { now })
    expect(lists.refresh).to be_empty
    old = lists.snapshot("warnlist").not_nil!
    now += 6.hours
    bodies["blocklist"] = "@NewBlock"
    bodies["warnlist"] = "Bad gateway"
    expect(lists.refresh).to eq(["warnlist"])
    expect(lists.snapshot("blocklist").not_nil!.entries.handles).to eq(Set{"@newblock"})
    expect(lists.snapshot("warnlist")).to eq(old)
    expect(lists.stale?("blocklist")).to be_false
    expect(lists.stale?("warnlist")).to be_true
    restored = described_class.new(storage, ->(kind : String) { bodies[kind] }, -> { now })
    restored.restore
    expect(restored.snapshot("warnlist")).to eq(old)
    expect(restored.snapshot("blocklist")).to eq(lists.snapshot("blocklist"))
  end

  it "survives network, storage and damaged-cache failures without dropping the other list" do
    storage = AiListMemoryStorage.new
    now = Time.utc
    storage.lists["blocklist"] = {"@Saved", now}
    storage.lists["warnlist"] = {"invalid", now}
    lists = described_class.new(storage, ->(_kind : String) { raise IO::Error.new("offline"); "" })
    lists.restore
    expect(lists.snapshot("blocklist").not_nil!.entries.handles).to eq(Set{"@saved"})
    expect(lists.snapshot("warnlist")).to be_nil
    expect(lists.refresh).to eq(%w(blocklist warnlist))
    expect(lists.snapshot("blocklist")).not_to be_nil
    storage.fail_writes = true
    lists = described_class.new(storage, ->(_kind : String) { "@Fresh" })
    lists.restore
    expect(lists.refresh).to eq(%w(blocklist warnlist))
    expect(lists.snapshot("blocklist").not_nil!.entries.handles).to eq(Set{"@saved"})
  end
end

Spectator.describe Invidious::AiSList::Resolver do
  it "uses observed and persisted identities without fetching, then refreshes after seven days" do
    storage = AiListMemoryStorage.new
    now = Time.utc
    calls = [] of String
    fetcher = ->(id : String) { calls << id; "@New".as(String?) }
    resolver = described_class.new(storage, fetcher, -> { now })
    id = "UC#{"a" * 22}"
    resolver.observe({id => "@Observed"})
    expect(resolver.handles([id])).to eq({id => "@observed"})
    restarted = described_class.new(storage, fetcher, -> { now })
    expect(restarted.handles([id])).to eq({id => "@observed"})
    expect(calls).to be_empty
    now += 7.days
    expect(restarted.handles([id])).to eq({id => "@new"})
    expect(calls).to eq([id])
  end

  it "negative-caches failures for one hour and keeps functioning without persistence" do
    storage = AiListMemoryStorage.new
    storage.fail_writes = true
    now = Time.utc
    calls = 0
    resolver = described_class.new(storage, ->(_id : String) { calls += 1; nil.as(String?) }, -> { now })
    id = "UC#{"a" * 22}"
    expect(resolver.handles([id])).to be_empty
    expect(resolver.handles([id])).to be_empty
    expect(calls).to eq(1)
    now += 1.hour
    expect(resolver.handles([id])).to be_empty
    expect(calls).to eq(2)
  end

  it "deduplicates lookups across concurrent page requests" do
    gate = Channel(Nil).new
    started = Channel(Nil).new
    calls = 0
    resolver = described_class.new(AiListMemoryStorage.new, ->(_id : String) {
      calls += 1
      started.send(nil)
      gate.receive
      "@Creator".as(String?)
    })
    id = "UC#{"a" * 22}"
    completed = Channel(Hash(String, String)).new(2)
    spawn { completed.send(resolver.handles([id, id])) }
    started.receive
    spawn { completed.send(resolver.handles([id])) }
    Fiber.yield
    gate.send(nil)
    2.times { expect(completed.receive).to eq({id => "@creator"}) }
    expect(calls).to eq(1)
  end

  it "shares one total deadline across all missing channels with a fake clock" do
    elapsed = Time::Span.zero
    budgets = [] of Time::Span
    resolver = described_class.new(AiListMemoryStorage.new, ->(_id : String) { nil.as(String?) },
      clock: -> { elapsed }, waiter: ->(_signal : Channel(Nil), budget : Time::Span) {
      budgets << budget
      elapsed += 1.second
      nil
    })
    resolver.handles(['a', 'b', 'c', 'd'].map { |letter| "UC#{letter.to_s * 22}" })
    expect(budgets).to eq([2.seconds, 1.second])
    expect(elapsed).to eq(2.seconds)
    Fiber.yield
  end

  it "limits workers to four, returns on timeout and learns later without another lookup" do
    gate = Channel(Nil).new
    started = Channel(Nil).new(8)
    calls = 0
    active = 0
    maximum = 0
    resolver = described_class.new(AiListMemoryStorage.new, ->(_id : String) {
      calls += 1
      active += 1
      maximum = Math.max(maximum, active)
      started.send(nil)
      gate.receive
      active -= 1
      "@Creator".as(String?)
    })
    ids = ('a'..'h').map { |letter| "UC#{letter.to_s * 22}" }
    expect(resolver.handles(ids, 5.milliseconds)).to be_empty
    expect(calls).to eq(4)
    8.times { gate.send(nil) }
    expect(resolver.handles(ids)).to eq(ids.to_h { |id| {id, "@creator"} })
    expect(maximum).to eq(4)
    expect(calls).to eq(8)
  end

  it "bounds queued work and ignores invalid channel IDs" do
    gate = Channel(Nil).new
    calls = 0
    resolver = described_class.new(AiListMemoryStorage.new, ->(_id : String) {
      calls += 1
      gate.receive?
      nil.as(String?)
    })
    ids = (1..500).map { |number| "UC#{number.to_s.rjust(22, '0')}" }
    resolver.handles(ids + ["invalid"], Time::Span.zero)
    Fiber.yield
    expect(calls).to eq(4)
    gate.close
    Fiber.yield
    expect(calls <= 260).to be_true
  end
end

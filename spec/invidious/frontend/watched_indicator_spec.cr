require "spectator"
require "../../../src/invidious/frontend/watched_indicator"
require "../../../src/invidious/database/watch_history"

Spectator.describe Invidious::Frontend::WatchedIndicator do
  it "renders the same safely escaped metadata contract for every thumbnail" do
    html = described_class.render(%(video"<&), 1000, true)
    expect(html).to contain("class=\"watched-indicator\" hidden")
    expect(html).to contain("data-id=\"video&quot;&lt;&amp;\"")
    expect(html).to contain("data-length=\"1000\"")
    expect(html).to contain("data-watched=\"true\"")
    expect(described_class.render("unknown", nil)).to contain("data-length=\"0\"")
  end
end

Spectator.describe Invidious::Database::WatchHistory::Entry do
  it "keeps older history imports compatible and preserves duration on export" do
    legacy = described_class.from_json(%({"video_id":"legacy"}))
    expect(legacy.length_seconds).to be_nil
    entry = described_class.from_json(%({"video_id":"known","length_seconds":1000}))
    expect(described_class.from_json(entry.to_json).length_seconds).to eq(1000)
  end

  it "treats invalid duration as unknown without discarding history metadata" do
    {"null", "0", "-1", "2147483648", "1.5", "\"invalid\""}.each do |value|
      entry = described_class.from_json(%({"video_id":"known","title":"Saved title","length_seconds":#{value}}))
      expect(entry.length_seconds).to be_nil
      expect(entry.title).to eq("Saved title")
    end
  end
end

require "spectator"
require "../../../src/invidious/frontend/blocked_channels"

private record BlockableItem, ucid : String?, id : String
private record UnownedItem, id : String

Spectator.describe Invidious::Frontend::BlockedChannels do
  it "filters by channel ID and leaves the shared collection unchanged" do
    items = [BlockableItem.new("UCblocked", "one"), BlockableItem.new("UCother", "two"), BlockableItem.new(nil, "three"), UnownedItem.new("four")]
    result = described_class.filter(items, ["UCblocked"])
    expect(result.map(&.id)).to eq(["two", "three", "four"])
    expect(items.size).to eq(4)
    expect(described_class.filter(items, [] of String)).to eq(items)
  end

  it "filters recommendations while retaining videos without channel metadata" do
    items = [{"id" => "one", "ucid" => "UCblocked"}, {"id" => "two", "ucid" => "UCother"}, {"id" => "three"}]
    expect(described_class.recommendations(items, ["UCblocked"]).map(&.["id"])).to eq(["two", "three"])
    expect(items.size).to eq(3)
    expect(described_class.recommendations(items.first(1), ["UCblocked"])).to be_empty
  end
end

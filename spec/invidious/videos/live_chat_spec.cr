require "json"
require "spectator"
require "../../../src/invidious/exceptions"
require "../../../src/invidious/videos/live_chat"

Spectator.describe Invidious::Videos::LiveChat do
  it "selects the initial renderer continuation" do
    data = JSON.parse(File.read("mocks/video/scheduled_live_PBD-Podcast.next.json")).as_h
    expected = data.dig("contents", "twoColumnWatchNextResults", "conversationBar", "liveChatRenderer",
      "continuations", 0, "reloadContinuationData", "continuation").as_s
    expect(described_class.initial_continuation(data)).to eq(expected)
  end

  it "returns no continuation for a video without chat" do
    expect(described_class.initial_continuation({} of String => JSON::Any)).to be_nil
  end

  it "selects the second replay mode when the labels are localized" do
    data = JSON.parse(File.read("mocks/video/scheduled_live_PBD-Podcast.next.json")).as_h
    header = data.dig("contents", "twoColumnWatchNextResults", "conversationBar", "liveChatRenderer", "header")
    first = JSON.parse(%({"continuationContents":{"liveChatContinuation":{"header":#{header.to_json}}}})).as_h
    items = first.dig("continuationContents", "liveChatContinuation", "header", "liveChatHeaderRenderer",
      "viewSelector", "sortFilterSubMenuRenderer", "subMenuItems").as_a
    items[1].as_h["title"] = JSON::Any.new("Rekaman live chat")
    expected = items[1].dig("continuation", "reloadContinuationData", "continuation").as_s
    expect(described_class.unfiltered_continuation(first)).to eq(expected)
  end

  it "parses replay messages, removals, and continuation" do
    data = JSON.parse(%({"continuationContents":{"liveChatContinuation":{"actions":[{"replayChatItemAction":{"videoOffsetTimeMsec":"1200","actions":[{"addChatItemAction":{"item":{"liveChatTextMessageRenderer":{"id":"a","authorName":{"simpleText":"Viewer <b>"},"message":{"runs":[{"text":"Hello "},{"emoji":{"shortcuts":[":wave:"]}}]}}}}}]}},{"replayChatItemAction":{"videoOffsetTimeMsec":"1500","actions":[{"addChatItemAction":{"item":{"liveChatPaidMessageRenderer":{"id":"b","authorName":{"simpleText":"Supporter"},"purchaseAmountText":{"simpleText":"$5"},"message":{"simpleText":"Great stream"}}}}}]}},{"replayChatItemAction":{"videoOffsetTimeMsec":"1600","actions":[{"removeChatItemAction":{"targetItemId":"a"}}]}}],"continuations":[{"liveChatReplayContinuationData":{"continuation":"next"}}]}}})).as_h
    chunk = described_class.parse_chunk(data)
    expect(chunk[:messages].size).to eq(2)
    expect(chunk[:messages][0]["offsetMs"].as_i64).to eq(1200_i64)
    expect(chunk[:messages][0]["text"].as_s).to eq("Hello :wave:")
    expect(chunk[:messages][0]["author"].as_s).to eq("Viewer <b>")
    expect(chunk[:messages][1]["kind"].as_s).to eq("paid")
    expect(chunk[:messages][1]["amount"].as_s).to eq("$5")
    expect(chunk[:removed_ids]).to eq(["a"])
    expect(chunk[:continuation]).to eq("next")
  end

  it "raises on an unrecognized replay response" do
    expect { described_class.parse_chunk({} of String => JSON::Any) }.to raise_error(BrokenTubeException)
  end
end

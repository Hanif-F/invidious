require "spectator"
require "json"
require "../../../src/invidious/user/imports"
require "../../../src/invidious/database/playback_positions"

Spectator.configure do |config|
  config.fail_blank
  config.randomize
end

def csv_sample
  return <<-CSV
  Kanal-ID,Kanal-URL,Kanaltitel
  UC0hHW5Y08ggq-9kbrGgWj0A,http://www.youtube.com/channel/UC0hHW5Y08ggq-9kbrGgWj0A,Matias Marolla
  UC0vBXGSyV14uvJ4hECDOl0Q,http://www.youtube.com/channel/UC0vBXGSyV14uvJ4hECDOl0Q,Techquickie
  UC1sELGmy5jp5fQUugmuYlXQ,http://www.youtube.com/channel/UC1sELGmy5jp5fQUugmuYlXQ,Minecraft
  UC9kFnwdCRrX7oTjqKd6-tiQ,http://www.youtube.com/channel/UC9kFnwdCRrX7oTjqKd6-tiQ,LUMOX - Topic
  UCBa659QWEk1AI4Tg--mrJ2A,http://www.youtube.com/channel/UCBa659QWEk1AI4Tg--mrJ2A,Tom Scott
  UCGu6_XQ64rXPR6nuitMQE_A,http://www.youtube.com/channel/UCGu6_XQ64rXPR6nuitMQE_A,Callcenter Fun
  UCGwu0nbY2wSkW8N-cghnLpA,http://www.youtube.com/channel/UCGwu0nbY2wSkW8N-cghnLpA,Jaiden Animations
  UCQ0OvZ54pCFZwsKxbltg_tg,http://www.youtube.com/channel/UCQ0OvZ54pCFZwsKxbltg_tg,Methos
  UCRE6itj4Jte4manQEu3Y7OA,http://www.youtube.com/channel/UCRE6itj4Jte4manQEu3Y7OA,Chipflake
  UCRLc6zsv_d0OEBO8OOkz-DA,http://www.youtube.com/channel/UCRLc6zsv_d0OEBO8OOkz-DA,Kegy
  UCSl5Uxu2LyaoAoMMGp6oTJA,http://www.youtube.com/channel/UCSl5Uxu2LyaoAoMMGp6oTJA,Atomic Shrimp
  UCXuqSBlHAE6Xw-yeJA0Tunw,http://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw,Linus Tech Tips
  UCZ5XnGb-3t7jCkXdawN2tkA,http://www.youtube.com/channel/UCZ5XnGb-3t7jCkXdawN2tkA,Discord
  CSV
end

Spectator.describe Invidious::User::Import do
  it "imports CSV" do
    subscriptions = Invidious::User::Import.parse_subscription_export_csv(csv_sample)

    expect(subscriptions).to be_an(Array(String))
    expect(subscriptions.size).to eq(13)

    expect(subscriptions).to contain_exactly(
      "UC0hHW5Y08ggq-9kbrGgWj0A",
      "UC0vBXGSyV14uvJ4hECDOl0Q",
      "UC1sELGmy5jp5fQUugmuYlXQ",
      "UC9kFnwdCRrX7oTjqKd6-tiQ",
      "UCBa659QWEk1AI4Tg--mrJ2A",
      "UCGu6_XQ64rXPR6nuitMQE_A",
      "UCGwu0nbY2wSkW8N-cghnLpA",
      "UCQ0OvZ54pCFZwsKxbltg_tg",
      "UCRE6itj4Jte4manQEu3Y7OA",
      "UCRLc6zsv_d0OEBO8OOkz-DA",
      "UCSl5Uxu2LyaoAoMMGp6oTJA",
      "UCXuqSBlHAE6Xw-yeJA0Tunw",
      "UCZ5XnGb-3t7jCkXdawN2tkA",
    ).in_order
  end
end

Spectator.describe "playback position imports" do
  let(now) { Time.utc(2026, 9, 9) }

  it "skips malformed entries without discarding valid progress" do
    entries = JSON.parse(<<-JSON).as_a
      [null, false, [], "bad", {},
       {"video_id":"abcdefghijk","position":9223372036854775807,"updated_at":#{now.to_unix}},
       {"video_id":"abcdefghijk","position":-1,"updated_at":#{now.to_unix}},
       {"video_id":"abcdefghijk","position":"10","updated_at":#{now.to_unix}},
       {"video_id":"abcdefghijk\\n","position":10,"updated_at":#{now.to_unix}},
       {"video_id":"abcdefghijk","position":10,"updated_at":-9223372036854775808},
       {"video_id":"abcdefghijk","position":42,"updated_at":#{now.to_unix}}]
      JSON
    parsed = Invidious::User::Import.parse_playback_positions(entries, now)
    expect(parsed).to eq([{video_id: "abcdefghijk", position: 42, updated_at: now}])
  end

  it "accepts 64-bit future timestamps safely and clamps them to now" do
    entries = JSON.parse(%([{"video_id":"abcdefghijk","position":2147483647,"updated_at":9223372036854775807}])).as_a
    parsed = Invidious::User::Import.parse_playback_positions(entries, now)
    expect(parsed).to eq([{video_id: "abcdefghijk", position: Int32::MAX, updated_at: now}])
  end

  it "keeps the newest distinct videos within the retention and count limits" do
    entries = (0..1000).map do |i|
      JSON.parse({video_id: i.to_s.rjust(11, '0'), position: i, updated_at: (now - i.seconds).to_unix}.to_json)
    end
    entries.unshift(entries.first)
    entries << JSON.parse({video_id: "expired0001", position: 1, updated_at: (now - 366.days).to_unix}.to_json)
    parsed = Invidious::User::Import.parse_playback_positions(entries, now)
    expect(parsed.size).to eq(1000)
    expect(parsed.first[:video_id]).to eq("00000000000")
    expect(parsed.last[:video_id]).to eq("00000000999")
    expect(parsed.map(&.[:video_id]).uniq!.size).to eq(1000)
  end
end

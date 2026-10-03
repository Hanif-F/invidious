require "spec"
require "../src/invidious/history"

record HistoryTestEntry, video_id : String, title : String?, channel_name : String?, latest_watched : String?

describe Invidious::History do
  it "organizes and searches the full history before pagination with stable recency ties" do
    entries = [
      HistoryTestEntry.new("older", "Café archive", "Studio", "2025-12-01"),
      HistoryTestEntry.new("unknown", nil, nil, nil),
      HistoryTestEntry.new("today1", "Other", "Studio", "2026-01-03"),
      HistoryTestEntry.new("today2", "Needle", "Studio", "2026-01-03"),
      HistoryTestEntry.new("future", "Future", "Studio", "2026-01-04"),
    ]
    watched = %w(today1 today2 older unknown future)
    organized = Invidious::History.organize(entries, watched, "", "2026-01-03")
    organized.map(&.video_id).should eq(%w(today2 today1 future older unknown))
    Invidious::History.page(organized, 2, 2).map(&.video_id).should eq(%w(future older))
    Invidious::History.page(organized, Int32::MAX, 1500).should be_empty
    Invidious::History.page(organized, 1, 0).should be_empty
    Invidious::History.organize(entries, watched, " NEEDLE ", "2026-01-03").map(&.video_id).should eq(["today2"])
    Invidious::History.organize(entries, watched, "CAFÉ", "2026-01-03").map(&.video_id).should eq(["older"])
    Invidious::History.organize(entries, watched, "studio", "2026-01-03").size.should eq(4)
  end
  it "searches titles and channel names case-insensitively without requiring metadata" do
    Invidious::History.matches?("Light & Color", nil, " LIGHT ").should be_true
    Invidious::History.matches?(nil, "Studio North", "studio NORTH").should be_true
    Invidious::History.matches?("Été", nil, "ÉTÉ").should be_true
    Invidious::History.matches?(nil, nil, "  ").should be_true
    Invidious::History.matches?(nil, nil, "missing").should be_false
    Invidious::History.matches?("Other title", "Other channel", "missing").should be_false
    Invidious::History.matches?("100% real", nil, "%").should be_true
  end

  it "uses disjoint rolling groups across month and year boundaries" do
    today = "2026-01-03"
    {"2026-01-03" => "history_today", "2026-01-02" => "history_yesterday",
     "2026-01-01" => "history_last_7_days", "2025-12-28" => "history_last_7_days",
     "2025-12-27" => "history_last_30_days", "2025-12-05" => "history_last_30_days",
     "2025-12-04" => "history_older", "2026-01-04" => "history_older"}.each do |date, group|
      Invidious::History.group(date, today).should eq(group)
    end
    Invidious::History.group(nil, today).should eq("history_older")
  end

  it "records calendar dates in the account timezone with UTC fallback" do
    now = Time.utc(2026, 9, 12, 18)
    Invidious::History.today("Asia/Jakarta", now).should eq("2026-09-13")
    Invidious::History.today(nil, now).should eq("2026-09-12")
    Invidious::History.today("not/a/timezone", now).should eq("2026-09-12")
    Invidious::History.timezone("not/a/timezone").should be_nil
  end

  it "handles DST and validates dates without inventing a release date" do
    Invidious::History.today("America/New_York", Time.utc(2026, 3, 8, 4, 59)).should eq("2026-03-07")
    Invidious::History.today("America/New_York", Time.utc(2026, 3, 8, 7)).should eq("2026-03-08")
    Invidious::History.date(nil).should be_nil
    Invidious::History.date("2026-02-30").should be_nil
    Invidious::History.date("2024-02-29").should eq("2024-02-29")
    Invidious::History.date("2026-09-13T00:00:00Z").should be_nil
  end
end

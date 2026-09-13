require "spec"
require "../src/invidious/history"

describe Invidious::History do
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

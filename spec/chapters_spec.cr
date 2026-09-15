require "spec"
require "../src/invidious/videos/chapters"

describe Invidious::Videos::Chapters do
  it "reads manual WAN Show timestamps including hours" do
    chapters = Invidious::Videos::Chapters.parse("Timestamps (courtesy of NoKi1119):\n0:00 Chapters\n1:45 Intro\n2:42 Topic #1: Apple Event\n1:40:05 MSI", 10000)
    chapters.map(&.[:start]).should eq([0, 105, 162, 6005])
    chapters.last[:title].should eq("MSI")
  end
  it "allows short sections, later starts, bullets, separators and Unicode" do
    chapters = Invidious::Videos::Chapters.parse(" • 1:03 — 日本語\n- 1:01 Intro\n* 1:02|Middle\n1:01 duplicate", 100)
    chapters.map(&.[:start]).should eq([61, 62, 63])
    chapters.map(&.[:title]).should eq(["Intro", "Middle", "日本語"])
  end
  it "rejects malformed, missing, overflowing and out-of-duration timestamps" do
    text = "0:60 Bad\n1:99:00 Bad\n1:02:99 Bad\n999999999999999999999:00 Bad\n0:01\n0:02 -\n-1:03 Bad\n3:00 End\n0:10 Good\n0:20 Also good"
    Invidious::Videos::Chapters.parse(text, 180).map(&.[:start]).should eq([10, 20])
    Invidious::Videos::Chapters.parse("0:10 One", 180).should be_empty
    Invidious::Videos::Chapters.parse("0:10 One\n0:20 Two", 0).should be_empty
  end
  it "preserves titles as plain text" do
    Invidious::Videos::Chapters.parse("0:00 <script>alert(1)</script>\n0:01 A & B", 2).first[:title].should eq("<script>alert(1)</script>")
  end
end

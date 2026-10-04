require "spectator"
require "../../../src/invidious/helpers/channel_avatars"

Spectator.describe Invidious::ChannelAvatars do
  it "uses uppercase Unicode initials without splitting character clusters" do
    {
      "zip Tie Tuning" => "Z",
      " \t\nZip Tie"   => "Z",
      "\u2003éclair"   => "É",
      "e\u0301clair"   => "É",
      "журнал"         => "Ж",
      "عالم"           => "ع",
      "שירים"          => "ש",
      "山田"             => "山",
      "किरण"           => "कि",
      "ßeta"           => "ß",
      "ﬃ studio"       => "ﬃ",
    }.each do |name, initial|
      expect(described_class.placeholder_initial(name)).to eq(initial)
    end
  end

  it "uses a hash for missing names and nonletter prefixes without scanning ahead" do
    {nil, "", " \t\n", "123 live", "😊 creator", "👩‍💻 creator", ".Zip Tie", "#channel", "<script>Zip"}.each do |name|
      expect(described_class.placeholder_initial(name)).to eq("#")
    end
  end

  it "gives equivalent initials the same stable palette color" do
    expect(described_class.placeholder_color(described_class.placeholder_initial("zip Tie"))).to eq(0)
    expect(described_class.placeholder_color(described_class.placeholder_initial("Zebra"))).to eq(0)
    expect(described_class.placeholder_color(described_class.placeholder_initial("éclair"))).to eq(3)
    expect(described_class.placeholder_color(described_class.placeholder_initial("e\u0301cole"))).to eq(3)
    expect(described_class.placeholder_color("#")).to eq(5)
    expect(described_class.placeholder_color("")).to eq(5)
  end

  it "normalizes supported avatars to the same proxy image across layouts" do
    {"https://yt3.ggpht.com/avatar=s48-c-k", "//yt3.googleusercontent.com/avatar=s176-c-k", "/ggpht/avatar=s88-c-k"}.each do |url|
      expect(described_class.proxy_url(url)).to eq("/ggpht/avatar=s88-c-k")
    end
    expect(described_class.proxy_url("https://yt3.ggpht.com/avatar?key=a&size=88")).to eq("/ggpht/avatar?key=a&size=88")
  end

  it "rejects missing, invalid and unrelated images without raising" do
    {nil, "", " ", "https://yt3.ggpht.com/", "javascript:alert(1)", "data:image/png;base64,abc",
     "https://example.com/avatar", "https://yt3.ggpht.com.evil.test/avatar", "https://user@yt3.ggpht.com/avatar",
     "https://yt3.ggpht.com:1234/avatar", "https://yt3.ggpht.com:invalid/avatar", "/avatar", "https://yt3.ggpht.com/a\\b"}.each do |url|
      expect(described_class.proxy_url(url)).to be_nil
    end
  end
end

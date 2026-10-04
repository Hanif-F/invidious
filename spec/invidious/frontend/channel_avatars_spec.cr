require "spectator"
require "../../../src/invidious/helpers/channel_avatars"

Spectator.describe Invidious::ChannelAvatars do
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

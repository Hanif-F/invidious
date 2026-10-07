require "spec"
require "../src/invidious/routes/api/v1/channels"

describe "Native channel clips metadata" do
  it "advertises clips between playlists and posts, in website order" do
    Invidious::Routes::API::V1::Channels.advertised_tabs(%w(posts playlists videos channels)).should eq(%w(videos playlists clips posts channels))
  end

  it "adds clips to channels without upstream clips and preserves future tabs" do
    Invidious::Routes::API::V1::Channels.advertised_tabs(%w(streams future clips clips)).should eq(%w(streams clips future))
    Invidious::Routes::API::V1::Channels.advertised_tabs([] of String).should eq(["clips"])
  end
end

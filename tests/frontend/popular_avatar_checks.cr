# Exercise the actual refresh, Popular template and API with local upstream fixtures.
# Match the getter in src/invidious.cr without starting the application/jobs.
def popular_videos
  Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.get
end

class HTTP::Client
  class_property popular_avatar_rss : String?
  class_property popular_avatar_rss_path : String?
  class_getter popular_avatar_rss_calls = 0

  def get(path : String)
    if rss = @@popular_avatar_rss
      raise "Unexpected HTTP request during refresh: #{path}" unless path == @@popular_avatar_rss_path
      @@popular_avatar_rss_calls += 1
      HTTP::Client::Response.new(200, body: rss)
    else
      get(path, nil)
    end
  end
end

module Invidious::Database::ChannelVideos
  class_property popular_avatar_capture = false
  class_getter popular_avatar_records = [] of ChannelVideo

  def insert(video : ChannelVideo, with_premiere_timestamp : Bool = false) : Bool
    if @@popular_avatar_capture
      @@popular_avatar_records << video
      false # No notification should block this isolated fixture harness.
    else
      previous_def
    end
  end
end

def popular_avatar_fixture(name)
  JSON.parse(File.read("spec/invidious/channels/fixtures/popular_avatars/#{name}.json"))
end

def popular_avatar_channel(key, author : String? = nil)
  metadata = popular_avatar_fixture("candidate_#{key}")["metadata"]["channelMetadataRenderer"]
  InvidiousChannel.new({id: metadata["externalId"].as_s, author: author || metadata["title"].as_s, updated: Time.utc, deleted: false, subscribed: nil})
end

def popular_avatar_rss(channel, videos)
  XML.build do |xml|
    xml.element("feed", xmlns: "http://www.w3.org/2005/Atom", "xmlns:yt": "http://www.youtube.com/xml/schemas/2015", "xmlns:media": "http://search.yahoo.com/mrss/") do
      xml.element("title") { xml.text channel.author }
      videos.first(15).each_with_index do |video, index|
        xml.element("entry") do
          xml.element("yt:videoId") { xml.text video.id }
          xml.element("yt:channelId") { xml.text channel.id }
          xml.element("title") { xml.text video.title }
          date = (Time.utc(2026, 10, 1) - index.days).to_rfc3339
          xml.element("published") { xml.text date }
          xml.element("updated") { xml.text date }
          xml.element("author") { xml.element("name") { xml.text channel.author } }
          xml.element("media:group") do
            xml.element("media:community") do
              xml.element("media:statistics", views: video.views.to_s)
            end
          end
        end
      end
    end
  end
end

def run_popular_avatar_refresh(key, response = popular_avatar_fixture("candidate_#{key}"), author : String? = nil)
  channel = popular_avatar_channel(key, author)
  source, _ = extract_items(popular_avatar_fixture("baseline_#{key}").as_h, channel.author, channel.id)
  videos = source.select(SearchVideo)
  HTTP::Client.popular_avatar_rss = popular_avatar_rss(channel, videos)
  HTTP::Client.popular_avatar_rss_path = "/feeds/videos.xml?channel_id=#{channel.id}"
  Invidious::Database::ChannelVideos.popular_avatar_records.clear
  Invidious::Database::ChannelVideos.popular_avatar_capture = true
  YoutubeAPI.avatar_listing_fixture = response.as_h
  cache = Invidious::Database::ChannelAvatars
  calls = YoutubeAPI.avatar_listing_calls
  rss_calls = HTTP::Client.popular_avatar_rss_calls
  writes = cache.comment_avatar_writes
  reads = cache.comment_avatar_reads
  metadata_calls = Invidious::Videos::Parser.avatar_metadata_calls
  fetched = fetch_channel(channel.id, pull_all_videos: false)
  raise "Refresh added metadata requests" unless YoutubeAPI.avatar_listing_calls == calls + 1
  raise "Refresh added RSS requests" unless HTTP::Client.popular_avatar_rss_calls == rss_calls + 1
  raise "Refresh did not use one cache batch" unless cache.comment_avatar_writes == writes + 1
  raise "Refresh read the avatar cache" unless cache.comment_avatar_reads == reads
  raise "Refresh fetched video/channel metadata separately" unless Invidious::Videos::Parser.avatar_metadata_calls == metadata_calls
  records = Invidious::Database::ChannelVideos.popular_avatar_records.dup
  raise "Refresh lost RSS videos" unless records.size == 15 && records.map(&.id) == videos.first(15).map(&.id)
  raise "Refresh changed video metadata" unless records.map { |v| {v.id, v.title, v.ucid, v.author, v.length_seconds, v.members_only, v.views} } == videos.first(15).map { |v| {v.id, v.title, v.ucid, v.author, v.length_seconds, v.members_only, v.views} }
  request = JSON.parse(YoutubeAPI.avatar_listing_requests.last[1])
  raise "Refresh used wrong browse endpoint" unless YoutubeAPI.avatar_listing_requests.last[0] == "/youtubei/v1/browse"
  raise "Refresh lost channel identity" unless fetched.id == channel.id && fetched.author == channel.author
  {records, request}
ensure
  HTTP::Client.popular_avatar_rss = nil
  HTTP::Client.popular_avatar_rss_path = nil
  Invidious::Database::ChannelVideos.popular_avatar_capture = false
  YoutubeAPI.avatar_listing_fixture = nil
end

def check_popular_avatar_refresh
  cache = Invidious::Database::ChannelAvatars
  expected = popular_avatar_fixture("expected_avatars").as_h.transform_values(&.as_s)
  PG_DB.exec("DELETE FROM channel_avatars")
  snapshots = [] of ChannelVideo
  {"ltt", "mrbeast"}.each do |key|
    records, request = run_popular_avatar_refresh(key)
    id = records.first.ucid
    raise "Replacement did not request Videos tab" unless request["browseId"].as_s == id && request["params"].as_s == "EgZ2aWRlb3PyBgQKAjoA" && !request["continuation"]?
    raise "Channel metadata avatar was not cached" unless cache.select([id]) == {id => expected[id]}
    snapshots << records.first
  end

  # Optional metadata never changes the videos or requests another channel lookup.
  valid = popular_avatar_fixture("candidate_ltt")
  missing = popular_avatar_fixture("candidate_ltt")
  missing.as_h.delete("metadata")
  malformed = popular_avatar_fixture("candidate_ltt")
  malformed["metadata"]["channelMetadataRenderer"].as_h["avatar"] = JSON::Any.new(42_i64)
  conflict = popular_avatar_fixture("candidate_ltt")
  conflict["metadata"]["channelMetadataRenderer"].as_h["externalId"] = JSON::Any.new("UCX6OQ3DkcsbYNE6H8uQQuVA")
  {missing, malformed, conflict}.each do |response|
    PG_DB.exec("DELETE FROM channel_avatars")
    run_popular_avatar_refresh("ltt", response)
    raise "Invalid channel metadata learned an avatar" unless cache.select(expected.keys).empty?
  end

  # A supplied channel metadata avatar wins over a same-channel listing image.
  first = valid.dig("contents", "twoColumnBrowseResultsRenderer", "tabs", 0, "tabRenderer", "content", "richGridRenderer", "contents", 0, "richItemRenderer", "content", "lockupViewModel", "metadata", "lockupMetadataViewModel")
  first.as_h["image"] = JSON.parse(%({"decoratedAvatarViewModel":{"avatar":{"avatarViewModel":{"image":{"sources":[{"url":"https://yt3.ggpht.com/card=s48"}]}}},"rendererContext":{"commandContext":{"onTap":{"innertubeCommand":{"browseEndpoint":{"browseId":"UCXuqSBlHAE6Xw-yeJA0Tunw"}}}}}}}))
  run_popular_avatar_refresh("ltt", valid)
  raise "Listing image replaced channel metadata avatar" unless cache.select([snapshots.first.ucid])[snapshots.first.ucid] == expected[snapshots.first.ucid]

  # Auto-generated channels keep the original first request.
  {"Fixture - Topic", "Popular on YouTube", "Music", "Sports", "Gaming"}.each do |author|
    PG_DB.exec("DELETE FROM channel_avatars")
    _, request = run_popular_avatar_refresh("ltt", popular_avatar_fixture("baseline_ltt"), author)
    raise "Auto-generated refresh used replacement request" unless request["continuation"]? && !request["browseId"]? && !request["params"]?
    raise "Auto-generated refresh learned unrelated metadata" unless cache.select(expected.keys).empty?
  end

  # General initial/sorted listings and continuations keep their existing builders.
  channel = popular_avatar_channel("ltt")
  YoutubeAPI.avatar_listing_fixture = popular_avatar_fixture("baseline_ltt").as_h
  {"newest", "popular", "oldest"}.each do |sort|
    calls = YoutubeAPI.avatar_listing_calls
    Invidious::Channel::Tabs.get_videos(channel, sort_by: sort)
    request = JSON.parse(YoutubeAPI.avatar_listing_requests.last[1])
    raise "General listing changed its request builder" unless request["continuation"]? && !request["browseId"]?
    raise "General listing added requests" unless YoutubeAPI.avatar_listing_calls == calls + 1
  end
  YoutubeAPI.avatar_listing_fixture = popular_avatar_fixture("continuation_ltt").as_h
  calls = YoutubeAPI.avatar_listing_calls
  items, _ = Invidious::Channel::Tabs.get_videos(channel, continuation: "fixture-next-page")
  request = JSON.parse(YoutubeAPI.avatar_listing_requests.last[1])
  raise "Continuation request changed" unless request["continuation"].as_s == "fixture-next-page" && !request["browseId"]? && items.select(SearchVideo).size == 30 && YoutubeAPI.avatar_listing_calls == calls + 1
  YoutubeAPI.avatar_listing_fixture = nil

  PG_DB.exec("DROP TABLE channel_avatars")
  records, _ = run_popular_avatar_refresh("ltt")
  raise "Optional cache failure lost refresh videos" unless records.first.id == snapshots.first.id
  PG_DB.exec("CREATE TABLE channel_avatars (ucid TEXT PRIMARY KEY, url TEXT NOT NULL, observed_at TEXT NOT NULL)")
  {"ltt", "mrbeast"}.each { |key| run_popular_avatar_refresh(key) }
  raise "Recovered metadata not available in shared cache" unless cache.select(expected.keys) == expected
  puts "Popular refresh: 60 matching first-page videos, 30 live continuation videos, 2 new metadata avatars; one browse/RSS request and one optional batch write; alternate paths and cache failures passed"
  snapshots
ensure
  YoutubeAPI.avatar_listing_fixture = nil
end

def popular_avatar_page_fixture(items, theme, thin = false)
  env = fixture_env("/feed/popular", thin: thin, visual_theme: theme)
  locale = "en-US"
  navbar_search = true
  Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.set(items)
  render "src/invidious/views/feeds/popular.ecr", "src/invidious/views/template.ecr"
end

popular_before = Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.get
popular_metadata_calls = Invidious::Videos::Parser.avatar_metadata_calls
popular_items = check_popular_avatar_refresh
popular_calls = YoutubeAPI.avatar_listing_calls
output = ENV["FRONTEND_FIXTURES"]? || "tests/frontend/.generated"
{"modern-neon", "diary"}.each do |theme|
  File.write("#{output}/popular-avatars-#{theme}.html", popular_avatar_page_fixture(popular_items, theme))
end
File.write("#{output}/popular-avatars-thin.html", popular_avatar_page_fixture(popular_items, "modern-neon", true))
api = Invidious::Routes::API::V1::Feeds.popular(fixture_env("/api/v1/popular")).not_nil!
records = JSON.parse(api).as_a
expected = popular_avatar_fixture("expected_avatars")
raise "Popular API lost videos" unless records.map(&.["videoId"].as_s) == popular_items.map(&.id)
records.each do |record|
  raise "Popular API did not serialize cached avatar" unless record["authorThumbnails"][0]["url"].as_s == expected[record["authorId"].as_s].as_s
end
File.write("#{output}/popular-avatars-api.json", api)
raise "Popular page/API added metadata requests" unless YoutubeAPI.avatar_listing_calls == popular_calls && Invidious::Videos::Parser.avatar_metadata_calls == popular_metadata_calls
Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.set(popular_before)
puts "Actual Popular template, native Popular API serialization, cross-page cache reuse and zero-added-metadata-request checks passed"

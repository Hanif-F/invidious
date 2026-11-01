# Production parsers, templates and upstream spies from the fixture harness.
def view_count_playlist_responses(items)
  [
    {contents: {twoColumnBrowseResultsRenderer: {tabs: [{tabRenderer: {selected: true, content: {
      sectionListRenderer: {contents: [{itemSectionRenderer: {contents: items}}]},
    }}}]}}},
    {onResponseReceivedActions: [{appendContinuationItemsAction: {continuationItems: items}}]},
    {response: {continuationContents: {playlistVideoListContinuation: {contents: items}}}},
  ].map { |response| JSON.parse(response.to_json).as_h }
end

def view_count_cards_fixture(thin = false, locale = "en-US")
  env = fixture_env("/playlist?list=PLfixture", thin: thin, locale: locale)
  item = real_avatar_items.first
  zero = item
  zero.id = "zeroview001"
  zero.title = "A real zero count"
  zero.views = 0_i64
  zero.view_count_precision = "exact"
  zero.view_count_type = "views"
  live = MixVideo.new({title: "Live viewers", id: "liveview001", author: "Creator", ucid: "UCfixture", length_seconds: 0, index: 2, rdid: "RDfixture", members_only: false})
  live.views = 12_i64
  live.view_count_precision = "exact"
  live.view_count_type = "watching"
  unknown = live
  unknown.id = "unknown0001"
  unknown.title = "No supplied or cached count"
  unknown.views = nil
  unknown.view_count_precision = nil
  unknown.view_count_type = nil
  items = [item, zero, live, unknown]
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

def view_count_queue_fixture
  playlist = JSON.parse({playlistId: "PLfixture", title: "Counts", videoCount: 4, videos: [
    {videoId: "2isYuQZMbdU", index: 0, title: "First occurrence", author: "Creator", lengthSeconds: 240},
    {videoId: "previous001", index: 1, title: "Real zero", author: "Creator", lengthSeconds: 360},
    {videoId: "2isYuQZMbdU", index: 2, title: "Repeated occurrence", author: "Creator", lengthSeconds: 930},
    {videoId: "nextvideo01", index: 3, title: "Unknown count", author: "Creator", lengthSeconds: 420},
  ]}.to_json)
  reads = [] of Array(String)
  Invidious::JSONify::APIv1::VideoMetadata.enrich(playlist, "en-US") do |ids|
    reads << ids
    {"2isYuQZMbdU" => Invidious::Videos::ViewCounts::Count.new(1234_i64, "exact"), "previous001" => Invidious::Videos::ViewCounts::Count.new(0_i64, "exact")}
  end
  raise "Queue misses were not batched/deduplicated" unless reads == [%w(2isYuQZMbdU previous001 nextvideo01)]
  html = template_playlist(playlist, false)
  raise "Repeated queue counts missing" unless html.scan("1.2K views").size == 2
  raise "Real queue zero missing" unless html.includes?("0 views")
  {playlistHtml: html, nextVideo: "nextvideo01", index: 3}.to_json
end

def check_view_counts(output)
  metadata_calls = Invidious::Videos::Parser.avatar_metadata_calls
  upstream_calls = YoutubeAPI.avatar_listing_calls
  items = JSON.parse(File.read("spec/invidious/frontend/fixtures/avatar_lockups.json")).as_a
  view_count_playlist_responses(items).each do |response|
    videos = extract_playlist_videos("PLfixture", response).select(PlaylistVideo)
    raise "Playlist response counts discarded" unless videos.map(&.views) == [106_000_000_i64, 386_000_000_i64]
    raise "Playlist precision discarded" unless videos.all? { |video| video.view_count_precision == "approximate" && video.view_count_type == "views" }
    api = JSON.parse(Invidious::JSONify::APIv1::VideoMetadata.enrich_json(videos.to_json))
    raise "Playlist API counts missing" unless api.as_a.map(&.["viewCount"].as_i64) == videos.map(&.views)
  end
  legacy = JSON.parse(%({"playlistVideoRenderer":{"videoId":"legacy00001","title":{"simpleText":"Legacy video"},"index":{"simpleText":"1"},"lengthText":{"simpleText":"2:00"},"videoInfo":{"simpleText":"No views"}}}))
  view_count_playlist_responses([legacy]).each do |response|
    video = extract_playlist_videos("PLfixture", response).first.as(PlaylistVideo)
    raise "Legacy zero lost" unless video.views == 0 && video.index == 0 && video.view_count_type == "views"
  end
  raise "View counts changed playlist DB fields" if PlaylistVideo.type_array.includes?("views") || PlaylistVideo.type_array.includes?("view_count_type")
  raise "View counts changed mix DB fields" if MixVideo.type_array.includes?("views")

  missing = JSON.parse(Invidious::JSONify::APIv1::VideoMetadata.enrich_json(%({"entries":[{"video_id":"missing0001"}]})))
  raise "Cache miss fabricated a count" if missing["entries"][0]["viewCount"]?
  {"cards" => {false, "en-US"}, "thin" => {true, "en-US"}, "rtl" => {false, "ar"}}.each do |suffix, (thin, locale)|
    html = view_count_cards_fixture(thin, locale)
    raise "Unknown count was displayed" if html.includes?("0 views</p>") && html.scan("0 views</p>").size > 1
    File.write("#{output}/view-counts-#{suffix}.html", html)
  end
  File.write("#{output}/view-counts-history.html", history_fixture(known_views: true))
  File.write("#{output}/view-counts-clips.html", clips_fixture(known_views: true))
  video = fixture_video
  video.info["views"] = JSON::Any.new(12_i64)
  video.info["viewCountPrecision"] = JSON::Any.new("exact")
  video.info["viewCountType"] = JSON::Any.new("watching")
  video.info["relatedVideos"] = JSON.parse([
    {"id" => "zeroview001", "title" => "A real zero", "author" => "Creator", "ucid" => "UCfixture", "author_verified" => "false", "length_seconds" => "120", "short_view_count" => "0", "view_count" => "0", "view_count_precision" => "exact", "view_count_type" => "views"},
    {"id" => "liveview001", "title" => "Concurrent viewers", "author" => "Creator", "ucid" => "UCfixture", "author_verified" => "false", "length_seconds" => "0", "short_view_count" => "1.2K", "view_count" => "1200", "view_count_precision" => "approximate", "view_count_type" => "watching"},
    {"id" => "unknown0001", "title" => "Unknown count", "author" => "Creator", "ucid" => "UCfixture", "author_verified" => "false", "length_seconds" => "120", "short_view_count" => "", "view_count" => "", "view_count_precision" => "unknown", "view_count_type" => ""},
  ].to_json)
  File.write("#{output}/view-counts-watch.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU"), nil, supplied_video: video))
  File.write("#{output}/view-counts-queue.json", view_count_queue_fixture)
  raise "View enrichment fetched video metadata" unless Invidious::Videos::Parser.avatar_metadata_calls == metadata_calls
  raise "View enrichment fetched a listing" unless YoutubeAPI.avatar_listing_calls == upstream_calls
  puts "View counts: playlist initial/continuation parsing, API parity, real zero, read-only cache misses, duplicate queues and zero-added-upstream-request checks passed"
end

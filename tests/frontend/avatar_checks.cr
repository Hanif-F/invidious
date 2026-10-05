# Runs inside the production-template fixture harness with an in-memory cache.
private record AvatarFixtureSource, ucid : String, author_thumbnail : String?

module YoutubeAPI
  class_getter avatar_listing_calls = 0
  class_property avatar_listing_fixture : Hash(String, JSON::Any)?
  class_getter avatar_listing_requests = [] of {String, String}

  def _post_json(endpoint : String, data : Hash, client_config : ClientConfig | Nil) : Hash(String, JSON::Any)
    @@avatar_listing_calls += 1
    @@avatar_listing_requests << {endpoint, data.to_json}
    if response = @@avatar_listing_fixture
      return response
    end
    raise "Avatar fixtures must never fetch upstream metadata"
  end
end

module Invidious::Videos::Parser
  class_getter avatar_metadata_calls = 0
  class_property avatar_fixture_info : Hash(String, JSON::Any)?

  # Spy on the existing metadata fetch boundary; no upstream traffic is permitted.
  def extract_video_info(video_id : String)
    @@avatar_metadata_calls += 1
    info = @@avatar_fixture_info || fixture_video.info
    info["version"] = JSON::Any.new(Video::SCHEMA_VERSION.to_i64)
    info
  end
end

def check_channel_avatars
  PG_DB.exec("CREATE TABLE channel_avatars (ucid TEXT PRIMARY KEY, url TEXT NOT NULL, observed_at TEXT NOT NULL)")
  cache = Invidious::Database::ChannelAvatars
  frontend = Invidious::Frontend::ChannelAvatars
  cache.observe({"UCcached" => "https://yt3.ggpht.com/cached=s48"}, Time.utc - 365.days)
  env = fixture_env("/feed/subscriptions")
  sources = [AvatarFixtureSource.new("UCcached", nil), AvatarFixtureSource.new("UCdirect", "https://yt3.googleusercontent.com/direct=s176"), AvatarFixtureSource.new("UCmissing", nil)]
  calls = Invidious::Videos::Parser.avatar_metadata_calls
  frontend.prepare(env, sources)
  raise "Cached avatar missing" unless frontend.render(env, "UCcached").includes?("/ggpht/cached=s88")
  raise "Response avatar missing" unless frontend.render(env, "UCdirect").includes?("/ggpht/direct=s88")
  raise "Uncached channel requested an image" if frontend.render(env, "UCmissing").includes?("<img")
  raise "Uncached placeholder missing" unless frontend.render(env, "UCmissing", name: "Zip Tie Tuning").includes?(%(class="channel-avatar-initial" dir="auto">Z</span>))
  raise "Missing name placeholder missing" unless frontend.render(env, "UCmissing").includes?(%(dir="auto">#</span>))
  raise "Placeholder expanded into markup" if frontend.render(env, "UCmissing", name: "<script>Zip").includes?("<script>")
  raise "Direct avatar not persisted" unless cache.select(["UCdirect"])["UCdirect"] == "/ggpht/direct=s88"
  cache.observe({"UCdirect" => "https://yt3.ggpht.com/older=s48"}, Time.utc - 2.days)
  raise "Older metadata replaced the URL" unless cache.select(["UCdirect"])["UCdirect"] == "/ggpht/direct=s88"
  raise "Cache miss fetched metadata" unless Invidious::Videos::Parser.avatar_metadata_calls == calls

  frontend.prepare(fixture_env("/channel/UCcached"), sources)
  raise "Own channel avatar repeated" if frontend.show?(fixture_env("/channel/UCcached/shorts"), "UCcached")
  raise "Other channel avatar suppressed" unless frontend.show?(fixture_env("/channel/UCcached"), "UCdirect")
  raise "Thin mode avatar shown" if frontend.show?(fixture_env("/feed/popular", thin: true), "UCcached")
  raise "Unknown channel has an avatar" unless frontend.render(env, "").empty?

  PG_DB.exec("DROP TABLE channel_avatars")
  frontend.prepare(env, sources)
  raise "Cache failure lost direct response avatar" unless frontend.render(env, "UCdirect").includes?("/ggpht/direct=s88")
  raise "Cache failure requested missing image" if frontend.render(env, "UCcached").includes?("<img")
  raise "Cache failure fetched metadata" unless Invidious::Videos::Parser.avatar_metadata_calls == calls

  # A cache write failure must not escape into get_video's DB-error refetch path.
  PG_DB.exec("CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, info TEXT, updated TEXT)")
  PG_DB.exec("DELETE FROM videos WHERE id = '2isYuQZMbdU'")
  fetched = get_video("2isYuQZMbdU")
  raise "Optional cache failure retried video metadata" unless Invidious::Videos::Parser.avatar_metadata_calls == calls + 1
  get_video("2isYuQZMbdU", refresh: false)
  raise "Cached video caused a metadata request" unless Invidious::Videos::Parser.avatar_metadata_calls == calls + 1
  PG_DB.exec("CREATE TABLE channel_avatars (ucid TEXT PRIMARY KEY, url TEXT NOT NULL, observed_at TEXT NOT NULL)")
  fetch_video("2isYuQZMbdU", nil)
  raise "Fetched video avatar not learned" if cache.select([fetched.ucid]).empty?
  raise "Avatar learning added metadata requests" unless Invidious::Videos::Parser.avatar_metadata_calls == calls + 2
  puts "Avatar request-budget, cache precedence, suppression and video-fetch checks passed"
end

def avatar_cards_fixture(theme = "modern-neon", path = "/feed/popular", thin = false, locale = "en-US", compact = false)
  env = fixture_env(path, "dark", thin, compact ? "compact" : "balanced", locale, theme)
  items = [
    SearchVideo.new({title: "An avatar already in this response beside a long creator name", id: "avatar00001", author: "A creator with a long name <script> & details", ucid: "UCdirect", published: Time.utc - 2.days, views: 100_i64, description_html: "", length_seconds: 1000, premiere_timestamp: nil, author_verified: true, author_thumbnail: "https://yt3.ggpht.com/direct=s48", badges: VideoBadges::None}),
    ChannelVideo.new({title: "A subscription with a cached avatar", id: "avatar00002", author: "Cached creator", ucid: "UCcached", published: Time.utc, updated: Time.utc, views: 100_i64, length_seconds: 1000, live_now: false, premiere_timestamp: nil, members_only: false}),
    PlaylistVideo.new({title: "An unknown creator uses a placeholder", id: "avatar00003", author: "Unknown creator", ucid: "UCmissing", published: Time.utc, length_seconds: 1000, plid: "PLfixture", index: 2_i64, live_now: false, members_only: false}),
    MixVideo.new({title: "Cached creator in a mix", id: "avatar00004", author: "Cached creator", ucid: "UCcached", length_seconds: 1000, rdid: "RDfixture", index: 3, members_only: false}),
  ]
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

def avatar_initials_fixture(theme = "modern-neon", mode = "dark")
  env = fixture_env("/feed/popular", mode, visual_theme: theme)
  locale = env.get("preferences").as(Preferences).locale
  names = ["Zip Tie Tuning", "zebra", "éclair", "e\u0301cole", "журнал", "عالم", "山田", "किरण", "ßeta", "123 live", "😊 creator", ".Zip", "", "Blue", "Cyan", "Dawn", "Emerald", "Forest", "Amber"]
  items = names.map_with_index do |name, index|
    ChannelVideo.new({title: "A channel without a cached avatar", id: "initial#{index}", author: name, ucid: "UCinitial#{index}", published: Time.utc, updated: Time.utc, views: 100_i64, length_seconds: 1000, live_now: false, premiere_timestamp: nil, members_only: false})
  end
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

def avatar_manager_fixture(theme = "modern-neon", thin = false)
  env = signed_in_env("/subscription_manager")
  preferences = env.get("preferences").as(Preferences)
  preferences.theme = theme
  preferences.thin_mode = thin
  env.set "preferences", preferences
  locale = preferences.locale
  referer = "/feed/subscriptions"
  subscriptions = ["UCdirect", "UCcached", "UCmissing"].map do |id|
    InvidiousChannel.new({id: id, author: "A long creator name <script> & details #{id}", updated: Time.utc, deleted: id == "UCmissing", subscribed: nil})
  end
  navbar_search = true
  render "src/invidious/views/user/subscription_manager.ecr", "src/invidious/views/template.ecr"
end

check_channel_avatars

# Exercise the native API enrichment against the real optional cache boundary.
# The metadata spy above would detect any attempt to resolve a missing identity.
def check_native_channel_avatars
  cache = Invidious::Database::ChannelAvatars
  cache.observe({"UCnativecached" => "https://yt3.ggpht.com/native=s48"})
  calls = Invidious::Videos::Parser.avatar_metadata_calls
  payload = %({"authorId":"UCnativedirect","authorThumbnails":[{"url":"https://yt3.ggpht.com/direct=s176"}],"videos":[{"authorId":"UCnativecached","videoId":"one"},{"authorId":"UCmissing","videoId":"two"}],"entries":[{"channel_id":"UCnativecached"}]})
  response = JSON.parse(Invidious::JSONify::APIv1::ChannelAvatars.enrich_json(payload))
  raise "Native supplied image was replaced" unless response["authorThumbnails"][0]["url"].as_s == "https://yt3.ggpht.com/direct=s176"
  raise "Native cached image missing" unless response["videos"][0]["authorThumbnails"][0]["url"].as_s == "/ggpht/native=s88"
  raise "Native history image missing" unless response["entries"][0]["authorThumbnails"][0]["url"].as_s == "/ggpht/native=s88"
  raise "Native cache miss received an image" if response["videos"][1]["authorThumbnails"]?
  raise "Native supplied image was not learned" unless cache.select(["UCnativedirect"])["UCnativedirect"] == "/ggpht/direct=s88"
  raise "Native enrichment fetched metadata" unless Invidious::Videos::Parser.avatar_metadata_calls == calls
  puts "Native response enrichment, cache learning and zero-added-metadata-request checks passed"
end

check_native_channel_avatars

def real_avatar_items
  items = JSON.parse(File.read("spec/invidious/frontend/fixtures/avatar_lockups.json")).as_a
  response = JSON.parse({onResponseReceivedActions: [{appendContinuationItemsAction: {continuationItems: items}}]}.to_json).as_h
  extract_playlist_videos("PLNoVVZkH7--4P12wo6pVV10ycmBCMct6l", response).select(PlaylistVideo)
end

def check_real_avatar_extraction
  videos = real_avatar_items
  ids = videos.map(&.ucid)
  cache = Invidious::Database::ChannelAvatars
  raise "Real fixture channels already cached" unless cache.select(ids).empty?
  expected = Invidious::ChannelAvatars.from_items(videos)
  raise "Real playlist avatars not recovered" unless expected.size == 2

  # Native serialization alone must learn the avatar for other pages.
  response = Invidious::JSONify::APIv1::ChannelAvatars.build do |json|
    json.array { videos.each &.to_json(json) }
  end
  raise "Native response lost real avatars" unless JSON.parse(response).as_a.all? { |video| video["authorThumbnails"][0]["url"].as_s == expected[video["authorId"].as_s] }
  raise "Native serialization lost playlist positions" unless JSON.parse(response).as_a.map(&.["index"].as_i) == [0, 1]
  raise "Real avatars not cached" unless cache.select(ids) == expected
  raise "Avatar changed playlist database fields" if PlaylistVideo.type_array.includes?("author_thumbnail")
  raise "Avatar changed playlist database values" if videos.first.to_a.includes?(videos.first.author_thumbnail)

  env = fixture_env("/feed/history")
  Invidious::Frontend::ChannelAvatars.prepare_ids(env, ids)
  ids.each do |id|
    raise "Another page cannot reuse real avatar" unless Invidious::Frontend::ChannelAvatars.render(env, id).includes?(expected[id])
  end
  raise "Real avatar extraction fetched metadata" unless YoutubeAPI.avatar_listing_calls == 0

  # Bad optional images or conflicting identities cannot discard playlist entries.
  [JSON.parse("null"), JSON.parse("42"), JSON.parse(%({"decoratedAvatarViewModel":{"avatar":"bad"}}))].each do |image|
    item = JSON.parse(File.read("spec/invidious/frontend/fixtures/avatar_lockups.json")).as_a.first
    item["lockupViewModel"]["metadata"]["lockupMetadataViewModel"].as_h["image"] = image
    response = JSON.parse({onResponseReceivedActions: [{appendContinuationItemsAction: {continuationItems: [item]}}]}.to_json).as_h
    video = extract_playlist_videos("PLfixture", response).first.as(PlaylistVideo)
    raise "Malformed avatar lost playlist identity" unless video.ucid == ids.first && video.index == 0
    raise "Malformed playlist avatar accepted" unless video.author_thumbnail.nil?
  end
  item = JSON.parse(File.read("spec/invidious/frontend/fixtures/avatar_lockups.json")).as_a.first
  endpoint = item["lockupViewModel"]["metadata"]["lockupMetadataViewModel"].dig("image", "decoratedAvatarViewModel", "rendererContext", "commandContext", "onTap", "innertubeCommand", "browseEndpoint")
  endpoint.as_h["browseId"] = JSON::Any.new("UCother")
  response = JSON.parse({onResponseReceivedActions: [{appendContinuationItemsAction: {continuationItems: [item]}}]}.to_json).as_h
  raise "Conflicting playlist avatar accepted" unless extract_playlist_videos("PLfixture", response).first.as(PlaylistVideo).author_thumbnail.nil?
  raise "Invalid avatar extraction fetched metadata" unless YoutubeAPI.avatar_listing_calls == 0
  puts "Real response avatar extraction, native serialization, cache reuse and zero-metadata-request checks passed"
end

def real_avatar_fixture(theme)
  env = fixture_env("/playlist", visual_theme: theme)
  locale = env.get("preferences").as(Preferences).locale
  items = real_avatar_items
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

check_real_avatar_extraction

def recommendation_avatar_video
  items = JSON.parse(File.read("spec/invidious/frontend/fixtures/recommendation_avatar_lockups.json")).as_a
  video = fixture_video
  raw = JSON.parse(File.read("mocks/video/regular_mrbeast.player.json")).as_h
  raw.merge!(JSON.parse(File.read("mocks/video/regular_mrbeast.next.json")).as_h)
  raw["contents"].dig("twoColumnWatchNextResults", "secondaryResults", "secondaryResults").as_h["results"] = JSON::Any.new(items)
  video.info = Invidious::Videos::Parser.parse_video_info(video.id, raw)
  # Match the raw player fields retained by normal extract_video_info.
  {"captions", "playabilityStatus", "playerConfig", "storyboards"}.each do |key|
    video.info[key] = raw[key] if raw[key]?
  end
  video
end

def check_recommendation_avatar_cache
  parser = Invidious::Videos::Parser
  cache = Invidious::Database::ChannelAvatars
  video = recommendation_avatar_video
  expected = Invidious::ChannelAvatars.from_video(video)
  ids = expected.keys
  PG_DB.exec("DELETE FROM channel_avatars")
  calls = parser.avatar_metadata_calls
  parser.avatar_fixture_info = video.info
  begin
    # Exactly the normal video fetch learns all recommendation URLs in one batch.
    fetched = fetch_video(video.id, nil)
    raise "Recommendation learning added metadata fetches" unless parser.avatar_metadata_calls == calls + 1
    raise "Recommendation avatars not cached during normal fetch" unless cache.select(ids) == expected
    raise "Main creator avatar replaced by recommendation" unless expected[video.ucid] == Invidious::ChannelAvatars.proxy_url(video.author_thumbnail)

    response = JSON.parse(fetched.to_json("en-US", nil))
    recommendations = response["recommendedVideos"].as_a
    raise "Modern recommendation metadata lost" unless recommendations.map(&.["videoId"].as_s) == fetched.related_videos.map(&.["id"])
    recommendations.first(2).each_with_index do |record, index|
      supplied = Invidious::ChannelAvatars.proxy_url(fetched.related_videos[index]["author_thumbnail"])
      raise "Recommendation API avatar not serialized" unless Invidious::ChannelAvatars.proxy_url(record["authorThumbnails"][0]["url"].as_s) == supplied
    end
    raise "Collaboration assigned a creator avatar" if recommendations.last["authorThumbnails"]?

    env = fixture_env("/feed/subscriptions")
    Invidious::Frontend::ChannelAvatars.prepare_ids(env, ids)
    ids.each do |id|
      raise "Another frontend page cannot reuse recommendation avatar" unless Invidious::Frontend::ChannelAvatars.render(env, id).includes?(expected[id])
    end
    raise "Cross-page reuse fetched metadata" unless parser.avatar_metadata_calls == calls + 1

    # The unchanged cached-video path must not force a refresh for new optional fields.
    PG_DB.exec("DELETE FROM videos WHERE id = '2isYuQZMbdU'")
    Invidious::Database::Videos.insert(fetched)
    get_video(video.id, refresh: false)
    raise "Compatible video cache forced metadata fetch" unless parser.avatar_metadata_calls == calls + 1

    PG_DB.exec("DROP TABLE channel_avatars")
    fetch_video(video.id, nil)
    raise "Recommendation cache failure retried video metadata" unless parser.avatar_metadata_calls == calls + 2
    PG_DB.exec("CREATE TABLE channel_avatars (ucid TEXT PRIMARY KEY, url TEXT NOT NULL, observed_at TEXT NOT NULL)")
    cache.observe(expected)
  ensure
    parser.avatar_fixture_info = nil
  end
  raise "Recommendation avatar checks fetched upstream" unless YoutubeAPI.avatar_listing_calls == 0
  puts "Recommendation avatar API, cache reuse, main-creator precedence and request-budget checks passed"
end

def recommendation_avatar_fixture(theme)
  env = fixture_env("/feed/subscriptions", visual_theme: theme)
  locale = env.get("preferences").as(Preferences).locale
  items = recommendation_avatar_video.related_videos.first(2).map do |video|
    ChannelVideo.new({title: video["title"], id: video["id"], author: video["author"], ucid: video["ucid"],
                      published: Time.utc, updated: Time.utc, views: short_text_to_number(video["short_view_count"]),
                      length_seconds: video["length_seconds"].to_i, live_now: false, premiere_timestamp: nil, members_only: false})
  end
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

check_recommendation_avatar_cache
avatar_output = ENV["FRONTEND_FIXTURES"]? || "tests/frontend/.generated"
{"modern-neon", "diary"}.each do |theme|
  File.write("#{avatar_output}/avatars-recommendations-#{theme}.html", recommendation_avatar_fixture(theme))
  File.write("#{avatar_output}/watch-recommendations-#{theme}.html", watch_fixture(fixture_env("/watch?v=2isYuQZMbdU", visual_theme: theme), nil, supplied_video: recommendation_avatar_video))
end
# Keep existing fixture caches available after the cache-failure check above.
Invidious::Database::ChannelAvatars.observe(Invidious::ChannelAvatars.from_items(real_avatar_items))
Invidious::Database::ChannelAvatars.observe({"UCdirect" => "https://yt3.ggpht.com/direct=s88"})
Invidious::Database::ChannelAvatars.observe({"UCcached" => "https://yt3.ggpht.com/cached=s88", "UCfixture" => "https://yt3.ggpht.com/history=s88"})
{"modern-neon", "diary"}.each do |theme|
  File.write("#{avatar_output}/avatars-real-#{theme}.html", real_avatar_fixture(theme))
  File.write("#{avatar_output}/avatars-#{theme}.html", avatar_cards_fixture(theme))
  File.write("#{avatar_output}/avatars-search-#{theme}.html", avatar_cards_fixture(theme, "/search"))
  File.write("#{avatar_output}/avatars-playlist-#{theme}.html", avatar_cards_fixture(theme, "/playlist"))
  File.write("#{avatar_output}/avatars-manager-#{theme}.html", avatar_manager_fixture(theme))
  File.write("#{avatar_output}/avatars-history-#{theme}.html", history_fixture(theme))
  {"dark", "light"}.each do |mode|
    File.write("#{avatar_output}/avatar-initials-#{theme}-#{mode}.html", avatar_initials_fixture(theme, mode))
  end
end
File.write("#{avatar_output}/avatars-channel.html", avatar_cards_fixture(path: "/channel/UCdirect"))
File.write("#{avatar_output}/avatars-thin.html", avatar_cards_fixture(thin: true))
File.write("#{avatar_output}/avatars-manager-thin.html", avatar_manager_fixture(thin: true))
File.write("#{avatar_output}/avatars-rtl.html", avatar_cards_fixture(locale: "ar", compact: true))

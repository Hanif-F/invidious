# Runs inside the production-template fixture harness with an in-memory cache.
private record AvatarFixtureSource, ucid : String, author_thumbnail : String?

module Invidious::Videos::Parser
  class_getter avatar_metadata_calls = 0

  # Spy on the existing metadata fetch boundary; no upstream traffic is permitted.
  def extract_video_info(video_id : String)
    @@avatar_metadata_calls += 1
    info = fixture_video.info
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
  raise "Uncached placeholder missing" unless frontend.render(env, "UCmissing").includes?("<svg")
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
avatar_output = ENV["FRONTEND_FIXTURES"]? || "tests/frontend/.generated"
Invidious::Database::ChannelAvatars.observe({"UCcached" => "https://yt3.ggpht.com/cached=s88", "UCfixture" => "https://yt3.ggpht.com/history=s88"})
{"modern-neon", "diary"}.each do |theme|
  File.write("#{avatar_output}/avatars-#{theme}.html", avatar_cards_fixture(theme))
  File.write("#{avatar_output}/avatars-search-#{theme}.html", avatar_cards_fixture(theme, "/search"))
  File.write("#{avatar_output}/avatars-playlist-#{theme}.html", avatar_cards_fixture(theme, "/playlist"))
  File.write("#{avatar_output}/avatars-manager-#{theme}.html", avatar_manager_fixture(theme))
  File.write("#{avatar_output}/avatars-history-#{theme}.html", history_fixture(theme))
end
File.write("#{avatar_output}/avatars-channel.html", avatar_cards_fixture(path: "/channel/UCdirect"))
File.write("#{avatar_output}/avatars-thin.html", avatar_cards_fixture(thin: true))
File.write("#{avatar_output}/avatars-manager-thin.html", avatar_manager_fixture(thin: true))
File.write("#{avatar_output}/avatars-rtl.html", avatar_cards_fixture(locale: "ar", compact: true))

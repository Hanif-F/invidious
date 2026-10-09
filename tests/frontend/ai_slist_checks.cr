# Uses local lists and fake resolution; no upstream request is allowed.
private class AiFixtureStorage < Invidious::AiSList::Storage
  getter lists = {} of String => Tuple(String, Time)
  getter handles = {} of String => Invidious::AiSList::HandleEntry

  def load_lists : Hash(String, Tuple(String, Time))
    @lists.dup
  end

  def save_list(kind : String, body : String, updated_at : Time) : Nil
    @lists[kind] = {body, updated_at}
  end

  def load_handles(ids : Array(String)) : Hash(String, Invidious::AiSList::HandleEntry)
    @handles.select { |id, _| ids.includes?(id) }
  end

  def save_handles(entries : Hash(String, Invidious::AiSList::HandleEntry)) : Nil
    @handles.merge!(entries)
  end
end

module Invidious::AiSList
  def self.fixture_runtime=(value : Runtime)
    @@runtime_mutex.synchronize { @@runtime = value }
  end
end

def ai_fixture_video(letter : Char, handle : String?) : SearchVideo
  video = SearchVideo.new({title: "Video from #{handle}", id: "ai#{letter}00000000", author: "Creator #{letter}", ucid: "UC#{letter.to_s * 22}", published: Time.utc, views: 100_i64, description_html: "", length_seconds: 60, premiere_timestamp: nil, author_verified: false, author_thumbnail: nil, badges: VideoBadges::None})
  video.author_handle = handle
  video
end

def check_ai_preferences
  keys = %w(ai_blocklist_feeds ai_blocklist_search ai_blocklist_recommendations ai_warnlist_feeds ai_warnlist_search ai_warnlist_recommendations)
  defaults = JSON.parse(Preferences.from_json("{}").to_json)
  raise "AI filtering must be opt-in" unless keys.all? { |key| defaults[key].as_bool == false }
  raise "Old YAML default changed" unless keys.all? { |key| JSON.parse(Preferences.from_yaml("{}").to_json)[key].as_bool == false }
  configured = ConfigPreferences.from_yaml("ai_blocklist_feeds: true\nai_warnlist_search: true\n")
  raise "Instance defaults lost" unless configured.ai_blocklist_feeds && configured.ai_warnlist_search
  original = CONFIG.default_user_preferences.ai_blocklist_feeds
  CONFIG.default_user_preferences.ai_blocklist_feeds = true
  raise "Instance defaults ignored" unless Preferences.from_json("{}").ai_blocklist_feeds
  CONFIG.default_user_preferences.ai_blocklist_feeds = original

  (keys + [""]).each do |selected|
    env = theme_post_env(selected.empty? ? "" : "#{selected}=on")
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    json = JSON.parse(saved.to_json)
    raise "Guest switches coupled" unless keys.all? { |key| json[key].as_bool == (key == selected) }
    raise "YAML roundtrip lost settings" unless Preferences.from_yaml(saved.to_yaml).to_json == saved.to_json

    user = signed_in_env("/preferences").get("user").as(User)
    env = theme_post_env(selected.empty? ? "" : "#{selected}=on")
    env.set "user", user
    Invidious::Routes::PreferencesRoute.update(env)
    stored = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
    raise "Account switches coupled" unless keys.all? { |key| JSON.parse(stored)[key].as_bool == (key == selected) }
    raise "Account settings leaked to guest cookies" if env.response.cookies.has_key?("PREFS")
    api = theme_post_env(saved.to_json, "application/json")
    api.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(api)
    user.preferences = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    api.set "user", user
    fetched = JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(api))
    raise "Account JSON lost switches" unless keys.all? { |key| fetched[key] == json[key] }
    exported = JSON.parse(Invidious::User::Export.to_invidious(user))
    raise "Export lost switches" unless keys.all? { |key| exported["preferences"][key] == json[key] }
    Invidious::User::Import.from_invidious(user, {preferences: exported["preferences"]}.to_json)
    imported = JSON.parse(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Import lost switches" unless keys.all? { |key| imported[key] == json[key] }
  end
end

def ai_search_empty_fixture(env)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  query = Invidious::Search::Query.new(HTTP::Params.parse("q=videos&page=2"))
  items = Invidious::Frontend::AiChannels.filter([ai_fixture_video('a', "@blocked")], env, :search)
  blocked_results = false
  member_results = false
  redirect_url = "/"
  page_nav_html = Invidious::Frontend::Pagination.nav_numeric(locale, base_url: "/search?#{query.to_http_params}", current_page: 2, show_next: true)
  navbar_search = true
  render "src/invidious/views/search.ecr", "src/invidious/views/template.ecr"
end

def check_ai_filtering(output)
  original = Invidious::AiSList.runtime
  storage = AiFixtureStorage.new
  now = Time.utc
  storage.save_list("blocklist", "@blocked\n", now)
  storage.save_list("warnlist", "@moderate\n", now - 7.hours)
  lists = Invidious::AiSList::Lists.new(storage)
  lists.restore
  calls = 0
  resolver = Invidious::AiSList::Resolver.new(storage, ->(_id : String) { calls += 1; nil.as(String?) })
  Invidious::AiSList.fixture_runtime = Invidious::AiSList::Runtime.new(lists, resolver)
  items = [ai_fixture_video('a', "@blocked"), ai_fixture_video('b', "@moderate"), ai_fixture_video('c', "@safe")]
  frontend = Invidious::Frontend::AiChannels
  {:feeds, :search, :recommendations}.each do |surface|
    {false, true}.each do |block|
      {false, true}.each do |warn|
        env = fixture_env("/search")
        env.set "preferences", Preferences.from_json({"ai_blocklist_#{surface}" => block, "ai_warnlist_#{surface}" => warn}.to_json)
        expected = items.reject { |item| (block && item.author_handle == "@blocked") || (warn && item.author_handle == "@moderate") }
        actual = frontend.filter(items, env, surface)
        raise "AI list/surface switches coupled" unless actual.map(&.id) == expected.map(&.id)
        recommendations = items.map { |item| {"id" => item.id, "ucid" => item.ucid, "author_handle" => item.author_handle.not_nil!} }
        if surface == :recommendations
          actual_recommendations = frontend.recommendations(recommendations, env)
          raise "Recommendations/autoplay ordering wrong" unless actual_recommendations.map(&.["id"]) == expected.map(&.id)
        end
      end
    end
  end
  raise "Known handles fetched metadata" unless calls == 0
  raise "Shared source collection mutated" unless items.size == 3
  raise "Internal handle leaked to public API" if JSON.parse(items.first.to_json("en-US", nil))["author_handle"]?

  env = fixture_env("/search")
  env.set "preferences", Preferences.from_json(%({"ai_blocklist_search":true}))
  channel = SearchChannel.new({author: "Blocked channel", ucid: items.first.ucid, author_thumbnail: "", subscriber_count: 0, video_count: 0, channel_handle: "@blocked", description_html: "", auto_generated: false, author_verified: false})
  raise "Non-video result removed" unless frontend.filter([items.first, channel], env, :search).size == 1
  raise "Unknown identity removed" unless frontend.filter([ai_fixture_video('d', nil)], env, :search).size == 1
  raise "Missing identity wasn't resolved once" unless calls == 1
  raise "Negative cache caused another lookup" unless frontend.filter([ai_fixture_video('d', nil)], env, :search).size == 1 && calls == 1

  lockups = JSON.parse(File.read("spec/invidious/frontend/fixtures/recommendation_avatar_lockups.json")).as_a
  parsed = parse_item(lockups.first).as(SearchVideo)
  raise "Modern author handle lost" unless parsed.author_handle == "@mrbeast"
  parsed_related = Invidious::Videos::Parser.parse_related_lockup(lockups.first).not_nil!
  raise "Modern recommendation handle lost" unless parsed_related["author_handle"].as_s == "@mrbeast"
  compact = JSON.parse(%({"videoId":"fixture0001","title":{"simpleText":"Video"},"shortBylineText":{"runs":[{"text":"Creator","navigationEndpoint":{"browseEndpoint":{"browseId":"#{items.first.ucid}","canonicalBaseUrl":"/@Blocked"}}}]}}))
  related = Invidious::Videos::Parser.parse_related_video(compact).not_nil!
  raise "Legacy recommendation handle lost" unless related["author_handle"].as_s == "@blocked"
  regular = JSON.parse({videoRenderer: compact}.to_json)
  raise "Search author handle lost" unless parse_item(regular).as(SearchVideo).author_handle == "@blocked"

  previous_calls = YoutubeAPI.avatar_listing_calls
  YoutubeAPI.avatar_listing_fixture = JSON.parse({metadata: {channelMetadataRenderer: {externalId: items.first.ucid, vanityChannelUrl: "https://www.youtube.com/@Blocked"}}}.to_json).as_h
  raise "Metadata lookup lost identity" unless Invidious::AiSList.fetch_handle(items.first.ucid) == "@blocked"
  raise "Metadata lookup added extra requests" unless YoutubeAPI.avatar_listing_calls == previous_calls + 1
  raise "Metadata lookup accepted another channel" unless Invidious::AiSList.fetch_handle(items[1].ucid).nil?
  YoutubeAPI.avatar_listing_fixture = nil

  # Render available and stale list status, independent switches and empty states.
  env = fixture_env("/preferences")
  env.set "preferences", Preferences.from_json(%({"ai_blocklist_feeds":true,"ai_blocklist_search":true,"ai_blocklist_recommendations":true}))
  File.write("#{output}/preferences-ai-filter.html", preferences_fixture(env))
  search_env = fixture_env("/search?q=videos&page=2")
  search_env.set "preferences", env.get("preferences").as(Preferences)
  File.write("#{output}/search-ai-empty.html", ai_search_empty_fixture(search_env))

  # The production watch template chooses autoplay from the filtered collection.
  video = fixture_video
  video.info["relatedVideos"] = JSON.parse(items.map { |item| {id: item.id, title: item.title, author: item.author, ucid: item.ucid, author_handle: item.author_handle, author_verified: "false", length_seconds: "60", short_view_count: "100"} }.to_json)
  watch_env = fixture_env("/watch?v=2isYuQZMbdU")
  watch_env.set "preferences", env.get("preferences").as(Preferences)
  filtered = frontend.recommendations(video.related_videos, watch_env)
  raise "Filtered autoplay target was retained" unless filtered.first["id"] == items[1].id
  video.info["relatedVideos"] = JSON.parse(filtered.to_json)
  File.write("#{output}/watch-ai-filter.html", watch_fixture(watch_env, nil, supplied_video: video))
  raise "Shared source recommendations mutated" unless items.size == 3

  # Unavailable lists must not schedule even one handle lookup.
  empty_lists = Invidious::AiSList::Lists.new(AiFixtureStorage.new)
  Invidious::AiSList.fixture_runtime = Invidious::AiSList::Runtime.new(empty_lists, resolver)
  raise "Unavailable list hid videos" unless frontend.filter([ai_fixture_video('e', nil)], env, :feeds).size == 1
  raise "Unavailable list fetched handles" unless calls == 1
  puts "AiSList preference persistence, list/surface matrix, metadata identity, autoplay, failure and zero-request checks passed"
ensure
  YoutubeAPI.avatar_listing_fixture = nil
  Invidious::AiSList.fixture_runtime = original.not_nil! if original
end

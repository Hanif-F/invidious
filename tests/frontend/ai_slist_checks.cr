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

def check_ai_preferences(output)
  check_ai_page_preferences(output)
  keys = %w(ai_blocklist_feeds ai_blocklist_search ai_blocklist_recommendations ai_warnlist_feeds ai_warnlist_search ai_warnlist_recommendations ai_blocklist_other_pages ai_warnlist_other_pages)
  actions = %w(ai_blocklist_action ai_warnlist_action)
  all_keys = keys + actions
  defaults = JSON.parse(Preferences.from_json("{}").to_json)
  raise "AI filtering must be opt-in" unless keys.all? { |key| defaults[key].as_bool == false }
  raise "Old YAML default changed" unless keys.all? { |key| JSON.parse(Preferences.from_yaml("{}").to_json)[key].as_bool == false }
  raise "Old action defaults changed" unless actions.all? { |key| defaults[key].as_s == "hide" }
  actions.each do |key|
    {JSON::Any.new("invalid"), JSON::Any.new(nil), JSON::Any.new(123_i64)}.each do |invalid|
      raise "Invalid JSON action accepted" unless JSON.parse(Preferences.from_json({key => invalid}.to_json).to_json)[key].as_s == "hide"
    end
    raise "Invalid YAML action accepted" unless JSON.parse(Preferences.from_yaml("#{key}: invalid").to_json)[key].as_s == "hide"
  end
  configured = ConfigPreferences.from_yaml("ai_blocklist_feeds: true\nai_warnlist_search: true\nai_blocklist_action: replace_thumbnail\nai_warnlist_other_pages: true\n")
  raise "Instance action defaults lost" unless configured.ai_blocklist_action == "replace_thumbnail" && configured.ai_warnlist_other_pages
  raise "Invalid instance action accepted" unless ConfigPreferences.from_yaml("ai_warnlist_action: invalid").ai_warnlist_action == "hide"
  raise "Instance defaults lost" unless configured.ai_blocklist_feeds && configured.ai_warnlist_search
  original_action = CONFIG.default_user_preferences.ai_blocklist_action
  original_other = CONFIG.default_user_preferences.ai_warnlist_other_pages
  CONFIG.default_user_preferences.ai_blocklist_action = "replace_thumbnail"
  CONFIG.default_user_preferences.ai_warnlist_other_pages = true
  raise "Instance presentation defaults ignored" unless Preferences.from_json("{}").ai_blocklist_action == "replace_thumbnail" && Preferences.from_yaml("{}").ai_warnlist_other_pages
  CONFIG.default_user_preferences.ai_blocklist_action = original_action
  CONFIG.default_user_preferences.ai_warnlist_other_pages = original_other
  original = CONFIG.default_user_preferences.ai_blocklist_feeds
  CONFIG.default_user_preferences.ai_blocklist_feeds = true
  raise "Instance defaults ignored" unless Preferences.from_json("{}").ai_blocklist_feeds
  CONFIG.default_user_preferences.ai_blocklist_feeds = original

  (keys + [""]).each_with_index do |selected, index|
    body = HTTP::Params.new
    body[selected] = "on" unless selected.empty?
    actions.each_with_index { |key, bit| body[key] = index.bit(bit) == 1 ? "replace_thumbnail" : "hide" }
    env = theme_post_env(body.to_s)
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    json = JSON.parse(saved.to_json)
    raise "Guest actions coupled" unless actions.all? { |key| json[key].as_s == body[key] }
    raise "Guest switches coupled" unless keys.all? { |key| json[key].as_bool == (key == selected) }
    raise "YAML roundtrip lost settings" unless Preferences.from_yaml(saved.to_yaml).to_json == saved.to_json

    user = signed_in_env("/preferences").get("user").as(User)
    env = theme_post_env(body.to_s)
    env.set "user", user
    Invidious::Routes::PreferencesRoute.update(env)
    stored = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
    raise "Account switches coupled" unless keys.all? { |key| JSON.parse(stored)[key].as_bool == (key == selected) }
    raise "Account actions lost" unless actions.all? { |key| JSON.parse(stored)[key] == json[key] }
    raise "Account settings leaked to guest cookies" if env.response.cookies.has_key?("PREFS")
    api = theme_post_env(saved.to_json, "application/json")
    api.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(api)
    user.preferences = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    api.set "user", user
    fetched = JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(api))
    raise "Account JSON lost switches" unless all_keys.all? { |key| fetched[key] == json[key] }
    exported = JSON.parse(Invidious::User::Export.to_invidious(user))
    raise "Export lost switches" unless all_keys.all? { |key| exported["preferences"][key] == json[key] }
    Invidious::User::Import.from_invidious(user, {preferences: exported["preferences"]}.to_json)
    imported = JSON.parse(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Import lost switches" unless all_keys.all? { |key| imported[key] == json[key] }
  end
end

# Exercise the canonical fields through the production form, API and serializers.
def check_ai_page_preferences(output)
  action_keys = %w(blocklist warnlist).flat_map do |kind|
    %w(feeds search recommendations other_pages).map { |surface| "ai_#{kind}_#{surface}_action" }
  end
  defaults = Preferences.from_json("{}")
  raise "Fresh filter enabled" if defaults.ai_filter_enabled
  raise "Fresh page actions enabled" unless action_keys.all? { |key| JSON.parse(defaults.to_json)[key].as_s == "off" }
  raise "Internal presence flags leaked" if defaults.to_json.includes?("_present") || defaults.to_yaml.includes?("_present")

  legacy = Preferences.from_json(%({"ai_blocklist_feeds":true,"ai_blocklist_search":true,"ai_blocklist_action":"replace_thumbnail","ai_warnlist_recommendations":true,"ai_warnlist_other_pages":true}))
  raise "Legacy filtering disabled" unless legacy.ai_filter_enabled
  raise "Legacy action lost" unless legacy.ai_blocklist_feeds_action == "replace_thumbnail" && legacy.ai_blocklist_search_action == "replace_thumbnail"
  raise "Legacy unchecked page enabled" unless legacy.ai_blocklist_recommendations_action == "off"
  raise "Legacy other-page action lost" unless legacy.ai_warnlist_other_pages_action == "replace_thumbnail" && legacy.ai_warnlist_recommendations_action == "hide"
  raise "Legacy YAML differs" unless Preferences.from_yaml(legacy.to_yaml).to_json == legacy.to_json
  explicit = Preferences.from_json(%({"ai_filter_enabled":false,"ai_blocklist_search":true,"ai_blocklist_search_action":"off"}))
  raise "Explicit Off ignored" if explicit.ai_filter_enabled || explicit.ai_blocklist_search_action != "off"
  action_keys.each do |key|
    {JSON::Any.new("invalid"), JSON::Any.new(nil), JSON::Any.new(123_i64), JSON::Any.new(true)}.each do |invalid|
      value = JSON.parse(Preferences.from_json({key => invalid}.to_json).to_json)[key].as_s
      raise "Invalid page action accepted" unless value == "off"
    end
    {"invalid", "null", "[]"}.each do |invalid|
      value = JSON.parse(Preferences.from_yaml("#{key}: #{invalid}").to_json)[key].as_s
      raise "Invalid YAML page action accepted" unless value == "off"
    end
  end
  raise "Other pages accepted Hide" unless Preferences.from_json(%({"ai_blocklist_other_pages_action":"hide"})).ai_blocklist_other_pages_action == "off"

  original_defaults = CONFIG.default_user_preferences
  begin
    CONFIG.default_user_preferences = ConfigPreferences.from_yaml("ai_filter_enabled: false\nai_blocklist_feeds_action: hide\nai_blocklist_search_action: replace_thumbnail\nai_warnlist_other_pages_action: replace_thumbnail\n")
    {Preferences.from_json("{}"), Preferences.from_yaml("{}")}.each do |configured|
      raise "Instance master ignored" if configured.ai_filter_enabled
      raise "Instance page defaults lost" unless configured.ai_blocklist_feeds_action == "hide" && configured.ai_blocklist_search_action == "replace_thumbnail" && configured.ai_warnlist_other_pages_action == "replace_thumbnail"
    end
    raise "Saved legacy Off overridden by instance" unless Preferences.from_json(%({"ai_blocklist_feeds":false})).ai_blocklist_feeds_action == "off"
    raise "Saved new Off overridden by instance" unless Preferences.from_yaml("ai_blocklist_feeds_action: off").ai_blocklist_feeds_action == "off"
    raise "Explicit master overridden by instance" unless Preferences.from_json(%({"ai_filter_enabled":true})).ai_filter_enabled
    CONFIG.default_user_preferences = ConfigPreferences.from_yaml("ai_blocklist_feeds: true\nai_blocklist_action: replace_thumbnail\n")
    raise "Legacy instance defaults lost" unless Preferences.from_json("{}").ai_blocklist_feeds_action == "replace_thumbnail" && Preferences.from_yaml("{}").ai_filter_enabled
    CONFIG.default_user_preferences = ConfigPreferences.from_yaml("ai_blocklist_search_action: hide\n")
    raise "Instance action did not infer master" unless Preferences.from_json("{}").ai_filter_enabled
    CONFIG.default_user_preferences = ConfigPreferences.from_yaml("ai_blocklist_other_pages_action: hide\nai_warnlist_search_action: invalid\n")
    raise "Invalid instance action enabled filtering" if Preferences.from_json("{}").ai_filter_enabled
  ensure
    CONFIG.default_user_preferences = original_defaults
  end

  body = HTTP::Params.new
  body["ai_filter_form_version"] = "2"
  body["ai_filter_enabled"] = "on"
  action_keys.each_with_index { |key, index| body[key] = key.includes?("other_pages") || index.odd? ? "replace_thumbnail" : "hide" }
  {false, true}.each do |account|
    saved = save_ai_page_preferences(defaults, body.to_s, account)
    json = JSON.parse(saved.to_json)
    raise "Master not saved" unless saved.ai_filter_enabled
    raise "Page choices coupled" unless action_keys.all? { |key| json[key].as_s == body[key] }
    raise "Page YAML roundtrip lost settings" unless Preferences.from_yaml(saved.to_yaml).to_json == saved.to_json
    paused = save_ai_page_preferences(saved, "ai_filter_form_version=2", account)
    raise "Master did not pause" if paused.ai_filter_enabled
    raise "Pause erased choices" unless action_keys.all? { |key| JSON.parse(paused.to_json)[key] == json[key] }
    stale = save_ai_page_preferences(paused, "ai_blocklist_search=on&ai_blocklist_action=hide", account)
    raise "Older form changed master" if stale.ai_filter_enabled
    raise "Older form erased choices" unless action_keys.all? { |key| JSON.parse(stale.to_json)[key] == json[key] }
    resumed = save_ai_page_preferences(paused, "ai_filter_form_version=2&ai_filter_enabled=on", account)
    raise "Resume lost actions" unless resumed.ai_filter_enabled && action_keys.all? { |key| JSON.parse(resumed.to_json)[key] == json[key] }
    unless account
      cookies = {"active" => saved, "paused" => paused, "resumed" => resumed}.transform_values { |value| Invidious::User::Cookies.prefs(nil, value).value }
      File.write("#{output}/ai-preferences-cookies.json", cookies.to_json)
    end

    next unless account
    user = signed_in_env("/preferences").get("user").as(User)
    user.preferences = paused
    api = theme_post_env(paused.to_json, "application/json")
    api.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(api)
    user.preferences = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    api.set "user", user
    fetched = JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(api))
    all_keys = action_keys + ["ai_filter_enabled"]
    raise "Page actions API roundtrip lost settings" unless all_keys.all? { |key| fetched[key] == JSON.parse(paused.to_json)[key] }
    exported = JSON.parse(Invidious::User::Export.to_invidious(user))
    raise "Export lost page actions" unless all_keys.all? { |key| exported["preferences"][key] == fetched[key] }
    Invidious::User::Import.from_invidious(user, {preferences: exported["preferences"]}.to_json)
    imported = JSON.parse(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Import lost paused actions" unless all_keys.all? { |key| imported[key] == fetched[key] }
  end
end

def save_ai_page_preferences(previous : Preferences, body : String, account : Bool) : Preferences
  env = theme_post_env(body)
  env.set "preferences", previous
  if account
    user = signed_in_env("/preferences").get("user").as(User)
    user.preferences = previous
    env.set "user", user
  end
  Invidious::Routes::PreferencesRoute.update(env)
  if account
    Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", env.get("user").as(User).email, as: String))
  else
    Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
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

def ai_other_preferences(env)
  preferences = env.get("preferences").as(Preferences)
  preferences.ai_blocklist_other_pages = preferences.ai_warnlist_other_pages = true
  # Other-page switches must replace even when Discovery is set to Hide.
  preferences.ai_blocklist_action = preferences.ai_warnlist_action = "hide"
  env.set "preferences", preferences
end

def ai_cards_fixture(env, items)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

def ai_subscriptions_fixture(env, items)
  ai_other_preferences(env)
  user = env.get("user").as(User)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  token = "fixture"
  videos = [items[0], items[2]]
  notifications = [items[1]]
  page = 1
  max_results = 20
  base_url = "/feed/subscriptions"
  navbar_search = true
  render "src/invidious/views/feeds/subscriptions.ecr", "src/invidious/views/template.ecr"
end

def ai_mix_fixture(env, items)
  ai_other_preferences(env)
  locale = env.get("preferences").as(Preferences).locale
  mix = Mix.new({title: "AI thumbnail mix", id: "RDfixture", videos: items.map_with_index { |item, index| MixVideo.new({title: item.title, id: item.id, author: item.author, ucid: item.ucid, length_seconds: 60, index: index, rdid: "RDfixture", members_only: false}) }})
  continuation = items.first.id
  navbar_search = true
  render "src/invidious/views/mix.ecr", "src/invidious/views/template.ecr"
end

def render_ai_thumbnail_fixtures(output, items, frontend, video, storage, lists, now)
  {"modern-neon", "diary"}.each do |theme|
    {false, true}.each do |thin|
      suffix = "#{theme}#{thin ? "-thin" : ""}"
      env = fixture_env("/search", "dark", thin, "compact", visual_theme: theme)
      preferences = env.get("preferences").as(Preferences)
      preferences.ai_blocklist_search = preferences.ai_warnlist_search = true
      preferences.ai_blocklist_recommendations = preferences.ai_warnlist_recommendations = true
      preferences.ai_blocklist_action = preferences.ai_warnlist_action = "replace_thumbnail"
      env.set "preferences", preferences
      filtered = frontend.filter(items, env, :search)
      File.write("#{output}/search-ai-thumbnails-#{suffix}.html", ai_cards_fixture(env, filtered))

      watch_env = fixture_env("/watch?v=2isYuQZMbdU", "dark", thin, visual_theme: theme)
      watch_env.set "preferences", preferences
      related = items.map { |item| {"id" => item.id, "title" => item.title, "author" => item.author, "ucid" => item.ucid, "author_handle" => item.author_handle.not_nil!, "author_verified" => "false", "length_seconds" => "60", "short_view_count" => "100"} }
      filtered_related = frontend.recommendations(related, watch_env)
      raise "Replaced autoplay target was removed" unless filtered_related.first["id"] == items.first.id
      video.info["relatedVideos"] = JSON.parse(filtered_related.to_json)
      File.write("#{output}/watch-ai-thumbnails-#{suffix}.html", watch_fixture(watch_env, nil, supplied_video: video))
      paused_preferences = preferences
      paused_preferences.ai_filter_enabled = false
      paused_env = fixture_env("/search", "dark", thin, visual_theme: theme)
      paused_env.set "preferences", paused_preferences
      File.write("#{output}/search-ai-paused-#{suffix}.html", ai_cards_fixture(paused_env, frontend.filter(items, paused_env, :search)))
      paused_watch = fixture_env("/watch?v=2isYuQZMbdU", "dark", thin, visual_theme: theme)
      paused_watch.set "preferences", paused_preferences
      video.info["relatedVideos"] = JSON.parse(frontend.recommendations(related, paused_watch).to_json)
      File.write("#{output}/watch-ai-paused-#{suffix}.html", watch_fixture(paused_watch, nil, supplied_video: video))

      library_env = fixture_env("/playlist?list=PLfixture", "dark", thin, "compact", visual_theme: theme)
      ai_other_preferences(library_env)
      playlist_items = items.map_with_index { |item, index| PlaylistVideo.new({title: item.title, id: item.id, author: item.author, ucid: item.ucid, length_seconds: 60, published: Time.utc, plid: "PLfixture", index: index.to_i64, live_now: false, members_only: false}) }
      File.write("#{output}/playlist-ai-thumbnails-#{suffix}.html", ai_cards_fixture(library_env, playlist_items))
      paused_library = fixture_env("/playlist?list=PLfixture", "dark", thin, visual_theme: theme)
      paused_library_preferences = library_env.get("preferences").as(Preferences)
      paused_library_preferences.ai_filter_enabled = false
      paused_library.set "preferences", paused_library_preferences
      File.write("#{output}/playlist-ai-paused-#{suffix}.html", ai_cards_fixture(paused_library, playlist_items))

      File.write("#{output}/mix-ai-thumbnails-#{suffix}.html", ai_mix_fixture(fixture_env("/mix?list=RDfixture", "dark", thin, visual_theme: theme), items))

      queue_env = fixture_env("/api/v1/playlists/PLfixture?format=html", "dark", thin, visual_theme: theme)
      ai_other_preferences(queue_env)
      queue_data = JSON.parse(queue_fixture(thin))
      # Duplicate occurrences retain their original indices and advancement target.
      source = JSON.parse({playlistId: "PLfixture", title: "AI queue", videoCount: 4, videos: [
        {videoId: "2isYuQZMbdU", index: 0, title: "First", author: "Creator a", authorId: items[0].ucid, lengthSeconds: 60},
        {videoId: "previous001", index: 1, title: "Warned", author: "Creator b", authorId: items[1].ucid, lengthSeconds: 60},
        {videoId: "2isYuQZMbdU", index: 2, title: "Duplicate", author: "Creator a", authorId: items[0].ucid, lengthSeconds: 60},
        {videoId: "nextvideo01", index: 3, title: "Safe", author: "Creator c", authorId: items[2].ucid, lengthSeconds: 60},
      ]}.to_json)
      original_source = source.to_json
      replacements = frontend.prepare_queue(queue_env, source["videos"].as_a)
      queue_data.as_h["playlistHtml"] = JSON::Any.new(template_playlist(source, false, thin, ai_thumbnails: replacements, locale: "en-US"))
      raise "Queue classification mutated public source" unless source.to_json == original_source
      File.write("#{output}/queue-ai-thumbnails-#{suffix}.json", queue_data.to_json)
      paused_queue = fixture_env("/api/v1/playlists/PLfixture?format=html", "dark", thin, visual_theme: theme)
      paused_queue.set "preferences", paused_library_preferences
      paused_queue_data = JSON.parse(queue_data.to_json)
      paused_replacements = frontend.prepare_queue(paused_queue, source["videos"].as_a)
      raise "Paused queue still replaced thumbnails" unless paused_replacements.empty?
      paused_queue_data.as_h["playlistHtml"] = JSON::Any.new(template_playlist(source, false, thin, ai_thumbnails: paused_replacements, locale: "en-US"))
      File.write("#{output}/queue-ai-paused-#{suffix}.json", paused_queue_data.to_json)

      source.as_h["mixId"] = JSON::Any.new("RDfixture")
      mix_html = template_mix(source, false, thin, ai_thumbnails: replacements, locale: "en-US")
      raise "Mix queue lost replacement thumbnails" unless mix_html.scan("ai-thumbnail-compact").size == 3
    end
    sub_env = signed_in_env("/feed/subscriptions")
    preferences = sub_env.get("preferences").as(Preferences)
    preferences.theme = theme
    sub_env.set "preferences", preferences
    File.write("#{output}/subscriptions-ai-thumbnails-#{theme}.html", ai_subscriptions_fixture(sub_env, items))
    File.write("#{output}/history-ai-thumbnails-#{theme}.html", history_fixture(theme, ai: true))
    File.write("#{output}/channel-ai-thumbnails-#{theme}.html", diary_channel_fixture(theme, "dark", ai: true))
    File.write("#{output}/channel-search-ai-thumbnails-#{theme}.html", diary_channel_fixture(theme, "dark", search: true, ai: true))
  end
  storage.save_list("blocklist", "@blocked\n#{fixture_clip.ucid}\n", now)
  lists.restore
  File.write("#{output}/clips-ai-thumbnails.html", clips_fixture(ai: true))
  File.write("#{output}/channel-clips-ai-thumbnails.html", clips_fixture(channel_page: true, ai: true))
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
  {:feeds, :search, :recommendations, :other}.each do |surface|
    suffix = surface == :other ? "other_pages" : surface.to_s
    actions = surface == :other ? {"off", "replace_thumbnail"} : {"off", "hide", "replace_thumbnail"}
    {false, true}.each do |enabled|
      actions.each do |block_action|
        actions.each do |warn_action|
          env = fixture_env("/search")
          preferences = Preferences.from_json({"ai_filter_enabled" => JSON::Any.new(enabled), "ai_blocklist_#{suffix}_action" => JSON::Any.new(block_action), "ai_warnlist_#{suffix}_action" => JSON::Any.new(warn_action)}.to_json)
          env.set "preferences", preferences
          expected = items.reject { |item| enabled && ((block_action == "hide" && item.author_handle == "@blocked") || (warn_action == "hide" && item.author_handle == "@moderate")) }
          actual = surface == :other ? (frontend.prepare(env, items); items) : frontend.filter(items, env, surface)
          raise "New page actions/global switch coupled" unless actual.map(&.id) == expected.map(&.id)
          { {block_action, items[0], "blocklist"}, {warn_action, items[1], "warnlist"} }.each do |action, item, kind|
            raise "New page thumbnail action wrong" unless frontend.thumbnail_kind(env, item.ucid) == (enabled && action == "replace_thumbnail" ? kind : nil)
          end
          if surface == :recommendations
            related = items.map { |item| {"id" => item.id, "ucid" => item.ucid, "author_handle" => item.author_handle.not_nil!} }
            raise "New recommendation action wrong" unless frontend.recommendations(related, env).map(&.["id"]) == expected.map(&.id)
          end
          # Unknown channels must not trigger metadata requests while paused.
          unless enabled
            frontend.filter([ai_fixture_video('z', nil)], env, surface)
            frontend.prepare_ids(env, ["UC#{"y" * 22}"])
            frontend.recommendations([{"id" => "unknown0001", "ucid" => "UC#{"x" * 22}"}], env)
            raise "Global Off fetched channel metadata" unless calls == 0
          end
        end
      end
    end
  end
  independent = Preferences.from_json(%({"ai_blocklist_feeds_action":"hide","ai_blocklist_search_action":"replace_thumbnail","ai_blocklist_recommendations_action":"off","ai_blocklist_other_pages_action":"replace_thumbnail"}))
  {:feeds, :search, :recommendations, :other}.each do |surface|
    env = fixture_env("/search")
    env.set "preferences", independent
    actual = surface == :other ? (frontend.prepare(env, items); items) : frontend.filter(items, env, surface)
    raise "Page groups share an action" unless actual.size == (surface == :feeds ? 2 : 3)
    raise "Page groups share replacement" unless frontend.thumbnail_kind(env, items.first.ucid) == ({:search, :other}.includes?(surface) ? "blocklist" : nil)
  end
  {:feeds, :search, :recommendations, :other}.each do |surface|
    {false, true}.each do |block|
      {false, true}.each do |warn|
        {"hide", "replace_thumbnail"}.each do |block_action|
          {"hide", "replace_thumbnail"}.each do |warn_action|
            env = fixture_env("/search")
            suffix = surface == :other ? "other_pages" : surface.to_s
            env.set "preferences", Preferences.from_json({"ai_blocklist_#{suffix}" => block, "ai_warnlist_#{suffix}" => warn, "ai_blocklist_action" => block_action, "ai_warnlist_action" => warn_action}.to_json)
            expected = items.reject { |item| surface != :other && ((block && block_action == "hide" && item.author_handle == "@blocked") || (warn && warn_action == "hide" && item.author_handle == "@moderate")) }
            actual = if surface == :other
                       frontend.prepare(env, items)
                       items
                     else
                       frontend.filter(items, env, surface)
                     end
            raise "AI actions/list/surface switches coupled" unless actual.map(&.id) == expected.map(&.id)
            { {block, block_action, items[0], "blocklist"}, {warn, warn_action, items[1], "warnlist"} }.each do |enabled, action, item, kind|
              replacement = enabled && (surface == :other || action == "replace_thumbnail")
              raise "AI thumbnail classification lost" unless frontend.thumbnail_kind(env, item.ucid) == (replacement ? kind : nil)
            end
            raise "Safe thumbnail replaced" unless frontend.thumbnail_kind(env, items[2].ucid).nil?
            if surface == :recommendations
              recommendations = items.map { |item| {"id" => item.id, "ucid" => item.ucid, "author_handle" => item.author_handle.not_nil!} }
              original_json = recommendations.to_json
              actual_recommendations = frontend.recommendations(recommendations, env)
              raise "Recommendations/autoplay ordering wrong" unless actual_recommendations.map(&.["id"]) == expected.map(&.id)
              raise "Shared recommendations mutated" unless recommendations.to_json == original_json
            end
          end
        end
      end
    end
  end
  raise "Known handles fetched metadata" unless calls == 0
  raise "Shared source collection mutated" unless items.size == 3
  raise "Internal handle leaked to public API" if JSON.parse(items.first.to_json("en-US", nil))["author_handle"]?

  # A direct-ID replacement must still check a handle-only Hide on another list.
  overlap = ai_fixture_video('f', "@moderate")
  storage.save_list("blocklist", "@blocked\n#{overlap.ucid}\n", now)
  lists.restore
  {:search, :other}.each do |surface|
    {"hide", "replace_thumbnail"}.each do |block_action|
      {"hide", "replace_thumbnail"}.each do |warn_action|
        suffix = surface == :other ? "other_pages" : surface.to_s
        env = fixture_env("/search")
        env.set "preferences", Preferences.from_json({"ai_blocklist_#{suffix}" => true, "ai_warnlist_#{suffix}" => true, "ai_blocklist_action" => block_action, "ai_warnlist_action" => warn_action}.to_json)
        if surface == :other
          frontend.prepare(env, [overlap])
          raise "Other page lost overlap warning" unless frontend.thumbnail_kind(env, overlap.ucid) == "blocklist"
        else
          actual = frontend.filter([overlap], env, surface)
          hidden = block_action == "hide" || warn_action == "hide"
          raise "Hide did not win overlapping matches" unless actual.empty? == hidden
          raise "Blocklist replacement priority lost" unless frontend.thumbnail_kind(env, overlap.ucid) == (hidden ? nil : "blocklist")
        end
      end
    end
  end
  raise "Direct-ID/known-handle overlap fetched metadata" unless calls == 0
  storage.save_list("blocklist", "@blocked\n", now)
  lists.restore

  env = fixture_env("/search")
  ai_other_preferences(env)
  frontend.filter(items, env, :search)
  frontend.prepare(env, items)
  raise "Other-page preferences leaked into disabled Discovery" unless items.all? { |item| frontend.thumbnail_kind(env, item.ucid).nil? }

  env = fixture_env("/search")
  env.set "preferences", Preferences.from_json(%({"ai_blocklist_search":true}))
  channel = SearchChannel.new({author: "Blocked channel", ucid: items.first.ucid, author_thumbnail: "", subscriber_count: 0, video_count: 0, channel_handle: "@blocked", description_html: "", auto_generated: false, author_verified: false})
  raise "Non-video result removed" unless frontend.filter([items.first, channel], env, :search).size == 1
  channel_env = fixture_env("/channel")
  ai_other_preferences(channel_env)
  frontend.prepare(channel_env, [channel])
  raise "Channel artwork classified as a video" unless frontend.thumbnail_kind(channel_env, channel.ucid).nil?
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
  {"modern-neon", "diary"}.each do |theme|
    {false, true}.each do |enabled|
      setting_env = fixture_env("/preferences", visual_theme: theme)
      setting_env.set "preferences", Preferences.from_json({theme: theme, dark_mode: "dark", ai_filter_enabled: enabled, ai_blocklist_feeds_action: "hide", ai_blocklist_search_action: "replace_thumbnail", ai_blocklist_recommendations_action: "off", ai_warnlist_search_action: "hide", ai_blocklist_other_pages_action: "replace_thumbnail"}.to_json)
      File.write("#{output}/preferences-ai-filter-#{theme}#{enabled ? "" : "-paused"}.html", preferences_fixture(setting_env))
    end
  end
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

  render_ai_thumbnail_fixtures(output, items, frontend, video, storage, lists, now)

  # Unavailable lists must not schedule even one handle lookup.
  empty_lists = Invidious::AiSList::Lists.new(AiFixtureStorage.new)
  Invidious::AiSList.fixture_runtime = Invidious::AiSList::Runtime.new(empty_lists, resolver)
  raise "Unavailable list hid videos" unless frontend.filter([ai_fixture_video('e', nil)], env, :feeds).size == 1
  raise "Unavailable list fetched handles" unless calls == 1
  ai_other_preferences(env)
  frontend.prepare_ids(env, ["UC#{"z" * 22}"])
  raise "Unavailable replacement list fetched handles" unless calls == 1
  puts "AiSList preference persistence, list/surface matrix, metadata identity, autoplay, failure and zero-request checks passed"
ensure
  YoutubeAPI.avatar_listing_fixture = nil
  Invidious::AiSList.fixture_runtime = original.not_nil! if original
end

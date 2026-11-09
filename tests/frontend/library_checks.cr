# D4 uses production views; real writes are covered by the guarded PG harness.
def library_playlist(id = "IVfixture", owner = "viewer@example.test", privacy = PlaylistPrivacy::Private, count = 205)
  indices = Array.new(count) { |i| 9_007_199_254_740_993_i64 + i.to_i64 }
  InvidiousPlaylist.new({id: id, title: "Light and motion — field notes", author: owner,
                         description: "Notes with <markup> & a closing </textarea> preserved literally.",
                         video_count: count, privacy: privacy, index: indices, created: Time.utc - 2.days, updated: Time.utc - 1.day})
end

def library_items(playlist, start = 0, count = 6, channel_id = "UCfixture")
  (start...(start + count)).map do |i|
    PlaylistVideo.new({title: ["A journey through light, color, and motion", "The same video, another occurrence", "観察の小さな記録 — ملاحظات"][i % 3],
                       id: i % 3 < 2 ? "2isYuQZMbdU" : "previous001", author: "Studio North", ucid: channel_id,
                       length_seconds: 930, published: Time.utc - 3.days, plid: playlist.id, index: playlist.index[i], live_now: false, members_only: false})
  end
end

def library_playlist_fixture(mode = "light", owned = true, page = 2, empty = false, saved = false, channel_id = "UCfixture", blocked = false)
  plid = owned ? "IVfixture" : "IVshared"
  env = owned ? signed_in_env("/playlist?list=#{plid}&page=#{page}") : fixture_env("/playlist?list=#{plid}&page=#{page}", mode)
  prefs = env.get("preferences").as(Preferences); prefs.dark_mode = mode; env.set "preferences", prefs
  env.set "blocked_channels", [channel_id] if blocked
  user = env.get?("user").try &.as(User)
  playlist = library_playlist(plid, owned ? "viewer@example.test" : "other@example.test", owned ? PlaylistPrivacy::Private : PlaylistPrivacy::Public, empty ? 0 : 205)
  env.set "remove_playlist_items", plid if owned
  env.set "playlist_order_total", playlist.video_count.to_s if owned
  env.set "playlist_saved", saved
  items = empty ? [] of PlaylistVideo : library_items(playlist, (page - 1) * 100, channel_id: channel_id)
  locale = prefs.locale
  page_nav_html = Frontend::Pagination.nav_numeric(locale, base_url: "/playlist?list=#{plid}", current_page: page, show_next: !empty && page < 3)
  navbar_search = true
  render "src/invidious/views/playlist.ecr", "src/invidious/views/template.ecr"
end

def library_form_fixture(kind, mode = "light", failed = false, uncertain = false)
  env = signed_in_env("/#{kind == "unsave" ? "delete" : kind}_playlist?list=IVfixture")
  prefs = env.get("preferences").as(Preferences); prefs.dark_mode = mode; env.set "preferences", prefs
  playlist = library_playlist
  plid = playlist.id
  locale = prefs.locale
  referer = "/feed/playlists"
  csrf_token = "fixture-csrf"
  navbar_search = true
  if failed
    env.params.body["title"] = "Keep my <typed> & quoted draft"
    env.params.body["privacy"] = "Unlisted"
    env.params.body["description"] = "Keep this </textarea> & description."
    env.set "playlist_form_error", "Choose Public, Unlisted or Private."
    env.set "playlist_form_field", "privacy"
  end
  env.set "playlist_form_uncertain", true if uncertain
  case kind
  when "create" then render "src/invidious/views/create_playlist.ecr", "src/invidious/views/template.ecr"
  when "edit"   then render "src/invidious/views/edit_playlist.ecr", "src/invidious/views/template.ecr"
  else
    subscribed = kind == "unsave"
    render "src/invidious/views/delete_playlist.ecr", "src/invidious/views/template.ecr"
  end
end

def library_add_fixture(private_search = false, mode = "light", failed = false)
  env = signed_in_env("/add_playlist_items#{private_search ? "" : "?list=IVfixture&q=light"}")
  env.request.method = "POST" if private_search
  preferences = env.get("preferences").as(Preferences); preferences.dark_mode = mode; env.set "preferences", preferences
  locale = preferences.locale
  plid = "IVfixture"
  playlist = library_playlist
  params = URI::Params{"q" => "\\https://example.com/a?x=1&y=2", "list" => plid, "date" => "week", "region" => "ID"}
  query = Invidious::Search::Query.new(params, :playlist, "ID")
  items = failed ? [] of SearchVideo : (0...3).map { |i| SearchVideo.new({id: i.to_s.rjust(11, '0'), title: "Light <study> #{i}", author: "Studio North", ucid: "UCfixture", length_seconds: 120, published: Time.utc - 2.days, views: 0_i64, description_html: "", premiere_timestamp: nil, author_verified: false, author_thumbnail: nil, badges: VideoBadges::None}) }
  env.set "add_playlist_items", plid
  env.set "playlist_search_error", true if failed
  next_params = query.to_http_params; next_params["list"] = plid
  page_nav_html = Frontend::Pagination.nav_numeric(locale, base_url: "/add_playlist_items?#{next_params}", current_page: 1, post: private_search)
  navbar_search = true
  render "src/invidious/views/add_playlist_items.ecr", "src/invidious/views/template.ecr"
end

def library_subscriptions_fixture(mode = "light", filtered = false, empty = false, blocked = false)
  env = signed_in_env("/feed/subscriptions#{filtered ? "?latest_only=1&unseen_only=1&notifications_only=0&sort=alphabetically" : ""}")
  preferences = env.get("preferences").as(Preferences); preferences.dark_mode = mode; env.set "preferences", preferences
  now = Time.utc
  names = ["Studio North", "A very long creator name <script> & details"] + (3..18).map { |i| "Channel #{i}" }
  shortcut_channels = names.map_with_index do |name, index|
    InvidiousChannel.new({id: "UC" + ('a'.ord + index).chr.to_s * 22, author: name, updated: now, deleted: false, subscribed: nil})
  end
  shortcut_channels.clear if empty
  user = env.get("user").as(User); user.subscriptions = shortcut_channels.map(&.id); user.preferences = preferences; env.set "user", user
  env.set "blocked_channels", [user.subscriptions.first] if blocked && !empty
  view = Frontend::SubscriptionFeed.preferences(preferences, env.params.query, true); env.set "subscription_view_preferences", view
  locale = preferences.locale
  videos = empty ? [] of SearchVideo : (0...3).map { |i| SearchVideo.new({id: i.to_s.rjust(11, '0'), title: "A field note #{i}", author: "Studio North", ucid: user.subscriptions.first, length_seconds: 120, published: Time.utc - 2.days, views: 0_i64, description_html: "", premiere_timestamp: nil, author_verified: false, author_thumbnail: nil, badges: VideoBadges::None}) }
  notifications = videos.empty? ? [] of SearchVideo : [videos.pop]
  token = "fixture-csrf"; page = 1; max_results = 3; base_url = "/feed/subscriptions?#{Frontend::SubscriptionFeed.params(view, max_results)}"; navbar_search = true
  render "src/invidious/views/feeds/subscriptions.ecr", "src/invidious/views/template.ecr"
end

def library_history_fixture(mode = "light", page = 1, disabled = false)
  env = signed_in_env("/feed/history?page=#{page}&max_results=2")
  preferences = env.get("preferences").as(Preferences)
  preferences.dark_mode = mode; preferences.watch_history = !disabled; preferences.save_player_pos = true
  env.set "preferences", preferences
  user = env.get("user").as(User); user.preferences = preferences
  entries = (0...5).map { |i| Invidious::Database::WatchHistory::Entry.new(i.to_s.rjust(11, '0'), i == 4 ? nil : "A history note #{i}", "Studio North", "UCfixture", nil, i < 3 ? "2026-09-13" : i == 3 ? "2026-09-12" : nil, length_seconds: i == 4 ? nil : 1000) }
  user.watched = entries.map(&.video_id); env.set "user", user
  watched = entries[(page - 1) * 2, Math.min(2, 5 - (page - 1) * 2)]
  history_count = entries.size; history_today = "2026-09-13"; history_query = ""; max_results = 2
  history_clear_url = "/feed/history"; base_url = "/feed/history?max_results=2"; locale = preferences.locale; navbar_search = true
  render "src/invidious/views/feeds/history.ecr", "src/invidious/views/template.ecr"
end

def library_clear_fixture
  env = signed_in_env("/clear_watch_history?referer=%2Ffeed%2Fhistory")
  locale = "en-US"; referer = "/feed/history"; csrf_token = "fixture-csrf"; navbar_search = true
  render "src/invidious/views/user/clear_watch_history.ecr", "src/invidious/views/template.ecr"
end

def library_mix_fixture(mode = "light")
  env = signed_in_env("/mix?list=RDabcdefghijk&continuation=abcdefghijk")
  preferences = env.get("preferences").as(Preferences); preferences.dark_mode = mode; env.set "preferences", preferences
  videos = library_items(library_playlist, count: 6).map_with_index do |item, index|
    MixVideo.new({title: item.title, id: item.id, author: item.author, ucid: item.ucid, length_seconds: item.length_seconds, index: index, rdid: "RDabcdefghijk", members_only: false})
  end
  mix = Mix.new({id: "RDabcdefghijk", title: "A mix of light & motion", videos: videos})
  continuation = "abcdefghijk"; locale = preferences.locale; navbar_search = true
  render "src/invidious/views/mix.ecr", "src/invidious/views/template.ecr"
end

def write_library_fixtures(output)
  prepare_fixture_user_names
  Invidious::Database::ChannelAvatars.observe({"UC" + "a" * 22 => "https://yt3.ggpht.com/studio-north=s48"})
  %w(light dark).each do |mode|
    File.write("#{output}/d4-manager-#{mode}.html", avatar_manager_fixture(mode: mode))
    File.write("#{output}/d4-mix-#{mode}.html", library_mix_fixture(mode))
    File.write("#{output}/d4-history-#{mode}.html", library_history_fixture(mode))
    File.write("#{output}/d4-playlist-#{mode}.html", library_playlist_fixture(mode))
    File.write("#{output}/d4-library-#{mode}.html", playlist_library_fixture(mode))
    File.write("#{output}/d4-subscriptions-#{mode}.html", library_subscriptions_fixture(mode))
    %w(create edit delete unsave).each { |kind| File.write("#{output}/d4-#{kind}-#{mode}.html", library_form_fixture(kind, mode)) }
  end
  File.write("#{output}/d4-channel-subscription.html", diary_channel_fixture(signed: true))
  File.write("#{output}/d4-history-page-2.html", library_history_fixture(page: 2))
  File.write("#{output}/d4-history-page-3.html", library_history_fixture(page: 3))
  File.write("#{output}/d4-history-paused.html", library_history_fixture(disabled: true))
  File.write("#{output}/d4-clear-history.html", library_clear_fixture)
  File.write("#{output}/d4-create-failed.html", library_form_fixture("create", failed: true))
  File.write("#{output}/d4-create-uncertain.html", library_form_fixture("create", failed: true, uncertain: true))
  File.write("#{output}/d4-edit-failed.html", library_form_fixture("edit", failed: true))
  File.write("#{output}/d4-add.html", library_add_fixture)
  File.write("#{output}/d4-add-private.html", library_add_fixture(true))
  File.write("#{output}/d4-add-error.html", library_add_fixture(failed: true))
  File.write("#{output}/d4-subscriptions-filtered.html", library_subscriptions_fixture(filtered: true))
  File.write("#{output}/d4-subscriptions-empty.html", library_subscriptions_fixture(empty: true))
  File.write("#{output}/d4-playlist-guest.html", library_playlist_fixture(owned: false, page: 1))
  File.write("#{output}/d4-playlist-empty.html", library_playlist_fixture(page: 1, empty: true))
  File.write("#{output}/d4-library-add.html", playlist_library_fixture(add_video: true))
  File.write("#{output}/d4-library-empty.html", playlist_library_fixture(empty: true))
end

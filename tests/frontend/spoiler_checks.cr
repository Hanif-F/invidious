def spoiler_env(path, guest = false, dearrow = false, days : Int32? = 7)
  env = guest ? fixture_env(path) : signed_in_env(path)
  prefs = env.get("preferences").as(Preferences)
  prefs.dearrow_enabled = dearrow
  prefs.channel_spoiler_settings[fixture_video.ucid] = Invidious::ChannelSpoilers::Rule.new("Studio <North>", true, true, days) unless guest
  env.set "preferences", prefs
  env.get?("user").try { |user| user.as(User).preferences = prefs }
  env
end

def spoiler_cards_fixture(env)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  items = [Time.utc - 3.days, Time.utc - 8.days, Time.unix(0), Time.utc + 1.day].map_with_index do |date, i|
    SearchVideo.new({title: "Original <title> #{i}", id: i.to_s.rjust(11, '0'), author: "Studio North", ucid: fixture_video.ucid,
                     published: date, views: 12_i64, description_html: "", length_seconds: 720, premiere_timestamp: nil,
                     author_verified: false, author_thumbnail: nil, badges: VideoBadges::None})
  end
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

def check_spoiler_preferences(output)
  id = fixture_video.ucid
  prefs = spoiler_env("/").get("preferences").as(Preferences)
  raise "Old preference defaults changed" unless Preferences.from_json("{}").channel_spoiler_settings.empty?
  raise "JSON rules lost" unless Preferences.from_json(prefs.to_json).channel_spoiler_settings[id].reveal_after_days == 7
  raise "YAML rules lost" unless Preferences.from_yaml(prefs.to_yaml).channel_spoiler_settings[id].hide_thumbnail
  user = signed_in_env("/").get("user").as(User)
  user.preferences = prefs
  update = theme_post_env("save_player_pos=on")
  update.set "user", user
  Invidious::Routes::PreferencesRoute.update(update)
  raise "Global preferences erased channel rules" unless user.preferences.channel_spoiler_settings[id].hide_title
  export_user = user
  export_user.email = "spoilers-export@example.test"
  export = Invidious::User::Export.to_invidious(export_user)
  Invidious::User::Import.from_invidious(user, {preferences: JSON.parse(export)["preferences"]}.to_json)
  raise "Import erased channel rules" unless user.preferences.channel_spoiler_settings[id].reveal_after_days == 7
  api = theme_post_env(user.preferences.to_json, "application/json")
  api.set "user", user
  Invidious::Routes::API::V1::Authenticated.set_preferences(api)
  fetched = Preferences.from_json(Invidious::Routes::API::V1::Authenticated.get_preferences(api))
  raise "API rules lost" unless fetched.channel_spoiler_settings[id].hide_title

  path = Invidious::Routes::ChannelSpoilerPreferences::PATH
  guest = fixture_env(path)
  Invidious::Routes::ChannelSpoilerPreferences.update(guest)
  raise "Guest account write accepted" unless guest.response.status_code == 403
  rejected = spoiler_env(path)
  rejected.set "sid", "fixture-session"
  Invidious::Routes::ChannelSpoilerPreferences.update(rejected)
  raise "Invalid CSRF accepted" unless rejected.response.status_code == 403
  invalid = spoiler_env("#{path}?channel=invalid")
  invalid.set "sid", "fixture-session"
  Invidious::Routes::ChannelSpoilerPreferences.show(invalid)
  raise "Invalid channel accepted" unless invalid.response.status_code == 400
  editor = spoiler_env("#{path}?channel=#{id}")
  editor.set "sid", "fixture-session"
  html = Invidious::Routes::ChannelSpoilerPreferences.show(editor)
  raise "Editor missing" unless html.includes?("Studio &lt;North&gt;") && html.includes?("reveal_after_days")
  File.write("#{output}/spoiler-editor-account.html", html)
  # A known channel name renders the guest editor without contacting YouTube.
  preferences = Preferences.from_json("{}")
  env = fixture_env(path)
  locale = "en-US"
  user = nil.as(User?)
  channel_id = id
  entry = Invidious::ChannelSpoilers::Rule.new("Studio <North>", false, false)
  csrf_token = ""
  navbar_search = true
  File.write("#{output}/spoiler-editor-guest.html", render "src/invidious/views/user/channel_spoilers.ecr", "src/invidious/views/template.ecr")

  {false, true}.each do |dearrow|
    env = spoiler_env("/feed/popular", dearrow: dearrow)
    html = spoiler_cards_fixture(env)
    raise "Unmasked title" if html.includes?(">Original &lt;title&gt; 0</span>")
    raise "Expired title hidden" unless html.includes?(">Original &lt;title&gt; 1</span>")
    raise "Unknown date message missing" unless html.includes?("Title hidden — upload date unknown")
    File.write("#{output}/spoiler-cards-#{dearrow ? "dearrow" : "original"}.html", html)
  end
  File.write("#{output}/spoiler-cards-guest.html", spoiler_cards_fixture(spoiler_env("/feed/popular", true, true)))
  video = fixture_video
  video.info["sourcePublished"] = JSON::Any.new((Time.utc - 3.days).to_rfc3339)
  {false, true}.each do |dearrow|
    env = spoiler_env("/watch?v=#{video.id}", dearrow: dearrow)
    File.write("#{output}/watch-spoiler-#{dearrow ? "dearrow" : "original"}.html", watch_fixture(env, "PLfixture", supplied_video: video, account: true))
  end
  File.write("#{output}/watch-spoiler-guest.html", watch_fixture(spoiler_env("/watch?v=#{video.id}", true, true), nil, supplied_video: video))
  File.write("#{output}/embed-spoiler.html", watch_fixture(spoiler_env("/embed/#{video.id}", dearrow: true), nil, true, supplied_video: video))
  queue_env = spoiler_env("/")
  queue = JSON.parse({playlistId: "PLfixture", title: "Playlist", videos: [0, 1].map { |i|
    {videoId: "00000000000", title: "Queue original", author: "Studio North", authorId: id, lengthSeconds: 720, index: i}
  }}.to_json)
  File.write("#{output}/queue-spoiler.json", {playlistHtml: template_playlist(queue, false, spoiler_env: queue_env), index: 1, nextVideo: "00000000000"}.to_json)
end

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
  check_spoiler_preparation
  id = fixture_video.ucid
  prefs = spoiler_env("/").get("preferences").as(Preferences)
  raise "Old preference defaults changed" unless Preferences.from_json("{}").channel_spoiler_settings.empty?
  raise "JSON rules lost" unless Preferences.from_json(prefs.to_json).channel_spoiler_settings[id].reveal_after_days == 7
  raise "YAML rules lost" unless Preferences.from_yaml(prefs.to_yaml).channel_spoiler_settings[id].hide_thumbnail
  user = signed_in_env("/").get("user").as(User)
  user.preferences = prefs
  update = preferences_post_env("save_player_pos=on")
  update.set "user", user
  seed_saved_preferences(update, prefs)
  Invidious::Routes::PreferencesRoute.update(update)
  user.preferences = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
  raise "Global preferences erased channel rules" unless user.preferences.channel_spoiler_settings[id].hide_title
  export_user = user
  export_user.email = "spoilers-export@example.test"
  export = Invidious::User::Export.to_invidious(export_user)
  Invidious::User::Import.from_invidious(user, {preferences: JSON.parse(export)["preferences"]}.to_json)
  raise "Import erased channel rules" unless user.preferences.channel_spoiler_settings[id].reveal_after_days == 7
  api = preferences_post_env(user.preferences.to_json, "application/json")
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
  File.write("#{output}/queue-spoiler.json", {playlistHtml: Invidious::Playlists::Playlists.template_playlist(queue, false, spoiler_env: queue_env), index: 1, nextVideo: "00000000000"}.to_json)

  {false, true}.each do |dearrow|
    env = spoiler_env("/feed/popular", dearrow: dearrow, days: nil)
    html = spoiler_cards_fixture(env)
    File.write("#{output}/spoiler-cards-indefinite-#{dearrow ? "dearrow" : "original"}.html", html)
    old_config = Invidious::Frontend::ChannelSpoilers.config(env)
    legacy = JSON.parse(old_config)
    legacy["rules"].as_h.each_value { |rule| rule.as_h.delete("reveal_after_days") }
    File.write("#{output}/spoiler-cards-legacy-#{dearrow ? "dearrow" : "original"}.html", html.sub(old_config, legacy.to_json.gsub("<", "\\u003c")))
  end
  File.write("#{output}/watch-spoiler-indefinite.html", watch_fixture(spoiler_env("/watch?v=#{video.id}", dearrow: true, days: nil), "PLfixture", supplied_video: video, account: true))
  File.write("#{output}/embed-spoiler-indefinite.html", watch_fixture(spoiler_env("/embed/#{video.id}", dearrow: true, days: nil), nil, true, supplied_video: video))
  File.write("#{output}/queue-spoiler-indefinite.json", {playlistHtml: Invidious::Playlists::Playlists.template_playlist(queue, false, spoiler_env: spoiler_env("/", days: nil)), index: 1, nextVideo: "00000000000"}.to_json)
  inactive = signed_in_env("/feed/popular")
  html = browse_fixture(inactive)
  raise "Inactive cached-page masking metadata missing" unless html.includes?("channel-spoiler-config") && html.includes?("data-spoiler-title") && html.includes?("/js/channel-spoilers.js")
  raise "Inactive runtime rules fabricated" unless JSON.parse(Invidious::Frontend::ChannelSpoilers.config(inactive))["rules"].as_h.empty?
  File.write("#{output}/spoiler-cards-inactive.html", html)

  many = spoiler_env("/")
  preferences = many.get("preferences").as(Preferences)
  preferences.channel_spoiler_settings = (0...500).to_h { |index| {"UC#{index.to_s.rjust(22, '0')}", Invidious::ChannelSpoilers::Rule.new("Channel #{index} with a long display name", true, true, 7)} }
  many.set "preferences", preferences
  before = preferences.channel_spoiler_settings.to_json.bytesize
  after = JSON.parse(Invidious::Frontend::ChannelSpoilers.config(many))["rules"].to_json.bytesize
  raise "Runtime includes channel names" if JSON.parse(Invidious::Frontend::ChannelSpoilers.config(many))["rules"].as_h.values.any? { |entry| entry.as_h.has_key?("name") }
  puts "Channel masking runtime rules (500 channels): #{before} -> #{after} bytes; no channel names sent to the masking runtime"
end

def check_spoiler_preparation
  id = fixture_video.ucid
  known = Time.utc(2026, 10, 1)
  candidates = [
    Invidious::Frontend::ChannelSpoilers::Candidate.new("known", id, known),
    Invidious::Frontend::ChannelSpoilers::Candidate.new("cached", id),
    Invidious::Frontend::ChannelSpoilers::Candidate.new("cached", id),
    Invidious::Frontend::ChannelSpoilers::Candidate.new("missing", id),
    Invidious::Frontend::ChannelSpoilers::Candidate.new("unrelated", "UC" + "z" * 22),
  ]
  env = spoiler_env("/")
  requests = [] of Array(String)
  Invidious::Frontend::ChannelSpoilers.prepare_candidates(env, candidates) do |ids|
    requests << ids
    {"cached" => known.as(Time?)}
  end
  raise "Unnecessary date lookup" unless requests == [["cached", "missing"]]
  Invidious::Frontend::ChannelSpoilers.prepare_candidates(env, candidates) { |ids| requests << ids; {} of String => Time? }
  raise "Date lookup repeated misses" unless requests.size == 1
  raise "Supplied date lost" unless Invidious::Frontend::ChannelSpoilers.publication(env, "known", nil) == known
  raise "Cached date lost" unless Invidious::Frontend::ChannelSpoilers.publication(env, "cached", nil) == known
  raise "Unknown date fabricated" unless Invidious::Frontend::ChannelSpoilers.publication(env, "missing", nil).nil?

  inactive = signed_in_env("/")
  prefs = inactive.get("preferences").as(Preferences)
  prefs.channel_spoiler_settings = {} of String => Invidious::ChannelSpoilers::Rule
  inactive.set "preferences", prefs
  Invidious::Frontend::ChannelSpoilers.prepare_candidates(inactive, candidates) { |ids| requests << ids; {} of String => Time? }
  raise "Inactive rules queried dates" unless requests.size == 1
  Invidious::Frontend::ChannelSpoilers.prepare_candidates(spoiler_env("/"), [Invidious::Frontend::ChannelSpoilers::Candidate.new("known", id, known)]) { |ids| requests << ids; {} of String => Time? }
  raise "Known dates queried" unless requests.size == 1

  guest = fixture_env("/")
  Invidious::Frontend::ChannelSpoilers.prepare_candidates(guest, candidates) { |ids| requests << ids; {} of String => Time? }
  raise "Inactive guest queried dates" unless requests.size == 1
  guest.request.cookies << HTTP::Cookie.new("iv_spoilers_guest", "1")
  Invidious::Frontend::ChannelSpoilers.prepare_candidates(guest, candidates) do |ids|
    requests << ids
    {} of String => Time?
  end
  raise "Guest fallback did not batch missing dates" unless requests.last == ["cached", "missing", "unrelated"]
  puts "Channel masking date reads: zero for inactive/known dates; one filtered batch with memoized misses"
end

# Production handler failure views with literal drafts; metadata is already known.
def write_masking_editor_fixtures(output)
  path = Invidious::Routes::ChannelSpoilerPreferences::PATH
  id = fixture_video.ucid
  {"light", "dark"}.each do |mode|
    {"invalid", "uncertain", "stale", "missing", "spaces"}.each do |kind|
      env = spoiler_env(path)
      prefs = env.get("preferences").as(Preferences)
      prefs.dark_mode = mode
      user = env.get("user").as(User)
      user.preferences = prefs
      env.set "user", user
      env.set "preferences", prefs
      env.set "sid", "fixture-session"
      fields = {"channel" => id, "action" => "save", "hide_title" => "on", "reveal_after_days" => "days<draft>&", "csrf_token" => Invidious::Helpers::Tokens.generate_response("fixture-session", {"POST:preferences/spoilers/channels"}, HMAC_KEY), "browser_profile" => Invidious::BrowserProfiles.render_scope(env)}
      fields["browser_profile"] = "earlier-profile" if kind == "stale"
      if kind == "spaces"
        fields["reveal_after_days"] = " 7 "
        fields["csrf_token"] = "expired"
      end
      if kind == "missing"
        fields.delete("reveal_after_days")
        fields["hide_thumbnail"] = "invalid"
      end
      post = HTTP::Server::Context.new(HTTP::Request.new("POST", path, HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded"}, URI::Params.encode(fields)), HTTP::Server::Response.new(IO::Memory.new))
      %w(user preferences sid csrf_token).each { |key| post.set key, env.get(key) }
      html = if kind == "uncertain"
               post.set "mask_draft", URI::Params.encode(fields)
               post.set "mask_error", I18n.translate(prefs.locale, "overhaul_channel_unconfirmed")
               post.set "mask_uncertain", true
               Invidious::Routes::ChannelSpoilerPreferences.show(post)
             else
               Invidious::Routes::ChannelSpoilerPreferences.update(post)
             end
      File.write("#{output}/d6-masking-#{kind}-#{mode}.html", html)
    end
  end
end

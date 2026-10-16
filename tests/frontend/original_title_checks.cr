# Production settings, render helpers and HTTP response selection; no upstream IO.
def original_title_env(path, enabled = true)
  env = HTTP::Server::Context.new(HTTP::Request.new("GET", path), HTTP::Server::Response.new(IO::Memory.new))
  env.set "preferences", Preferences.from_json({show_original_title: enabled}.to_json)
  env
end

def check_original_titles(output)
  original = "原題 <日本語> & café"
  calls = 0
  client = Invidious::OriginalTitles::Client.new(->(_id : String) {
    calls += 1
    Invidious::OriginalTitles::Result.new(original, 6.hours)
  })
  defaults = Preferences.from_json("{}")
  raise "Original titles must default on" unless defaults.show_original_title && Preferences.from_yaml("{}").show_original_title && ConfigPreferences.from_yaml("{}").show_original_title
  disabled = Invidious::OriginalTitles::Selection.new(false, client)
  raise "Disabled titles changed" unless disabled.title("aaaaaaaaaaa", "Translated") == "Translated" && calls == 0

  {true, false}.each do |enabled|
    body = "save_player_pos=on&show_original_title_present=1"
    body += "&show_original_title=on" if enabled
    env = theme_post_env(body)
    Invidious::Routes::PreferencesRoute.update(env)
    prefs = Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value))
    raise "Guest title choice lost" unless prefs.show_original_title == enabled && Preferences.from_yaml(prefs.to_yaml).show_original_title == enabled
    user = signed_in_env("/preferences").get("user").as(User)
    env = theme_post_env(body)
    env.set "user", user
    Invidious::Routes::PreferencesRoute.update(env)
    raw = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
    raise "Account title choice lost" unless Preferences.from_json(raw).show_original_title == enabled
    api = theme_post_env(prefs.to_json, "application/json")
    api.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(api)
    stored = PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)
    user.preferences = Preferences.from_json(stored)
    api.set "user", user
    raise "API title choice lost" unless Preferences.from_json(Invidious::Routes::API::V1::Authenticated.get_preferences(api)).show_original_title == enabled
    user.preferences = prefs
    export_user = user
    export_user.email = "original-title-export@example.test"
    exported = JSON.parse(Invidious::User::Export.to_invidious(export_user))
    Invidious::User::Import.from_invidious(user, {preferences: exported["preferences"]}.to_json)
    raise "Backup title choice lost" unless user.preferences.show_original_title == enabled
    old = theme_post_env("save_player_pos=on")
    old.set "preferences", prefs
    Invidious::Routes::PreferencesRoute.update(old)
    raise "Old form reset title choice" unless Preferences.from_json(URI.decode_www_form(old.response.cookies["PREFS"].value)).show_original_title == enabled
  end

  {true, false}.each do |enabled|
    env = original_title_env("/api/v1/search", enabled)
    raise "Saved choice ignored" unless Invidious::OriginalTitles.selection(env).enabled == enabled
    {true, false}.each do |override|
      env = original_title_env("/api/v1/search?show_original_title=#{override}", enabled)
      raise "Query did not override saved choice" unless Invidious::OriginalTitles.selection(env).enabled == override
    end
  end
  %w(1 on FALSE null).each do |value|
    raise "Invalid title query accepted" if Invidious::OriginalTitles.valid_query?(original_title_env("/api/v1/search?show_original_title=#{value}"))
  end
  raise "Duplicate title query accepted" if Invidious::OriginalTitles.valid_query?(original_title_env("/api/v1/search?show_original_title=true&show_original_title=false"))
  env = original_title_env("/feed/private")
  env.set "original_titles_enabled", false
  raise "Feed owner preference ignored" if Invidious::OriginalTitles.selection(env).enabled
  env = original_title_env("/feed/channel/UCtest", false)
  raise "Public feed used browser preference" unless Invidious::OriginalTitles.selection(env).enabled == CONFIG.default_user_preferences.show_original_title

  # Exercise the actual route handler, including validation before the route runs.
  Kemal::RouteHandler::INSTANCE.add_route("GET", "/api/v1/videos/original-title-test") do |env|
    env.response.content_type = "application/json"
    {videoId: "aaaaaaaaaaa", title: "Translated", recommendedVideos: [{videoId: "bbbbbbbbbbb", title: "Translated"}]}.to_json
  end
  {true, false}.each do |enabled|
    io = IO::Memory.new
    env = HTTP::Server::Context.new(HTTP::Request.new("GET", "/api/v1/videos/original-title-test"), HTTP::Server::Response.new(io))
    env.set "preferences", defaults
    env.set "original_title_selection", Invidious::OriginalTitles::Selection.new(enabled, client)
    Kemal::RouteHandler::INSTANCE.call(env)
    env.response.close
    raise "HTTP API title selection failed" unless io.to_s.includes?(enabled ? original : "Translated")
  end
  io = IO::Memory.new
  env = HTTP::Server::Context.new(HTTP::Request.new("GET", "/api/v1/videos/original-title-test?show_original_title=invalid"), HTTP::Server::Response.new(io))
  env.set "preferences", defaults
  Kemal::RouteHandler::INSTANCE.call(env)
  raise "HTTP invalid query did not return 400" unless env.response.status_code == 400

  env = original_title_env("/feed/private")
  env.set "original_title_selection", Invidious::OriginalTitles::Selection.new(true, client)
  xml = %(<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/"><title>My playlist</title><entry><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Translated</title><media:group><media:title>Translated</media:title></media:group></entry></feed>)
  feed = XML.parse(Invidious::OriginalTitles.feed(env, xml))
  raise "Feed name changed" unless feed.xpath_node("/*/*[local-name()='title']").try(&.content) == "My playlist"
  raise "Feed titles not selected" unless feed.xpath_nodes("//*[local-name()='entry']//*[local-name()='title']").all? { |node| node.content == original }

  env = fixture_env("/watch?v=2isYuQZMbdU")
  env.set "original_title_selection", Invidious::OriginalTitles::Selection.new(true, client)
  html = watch_fixture(env, nil)
  document = XML.parse_html(html)
  raise "Watch heading not original" unless document.xpath_node("//h1").try(&.content) == original
  raise "Watch metadata not original" unless document.xpath_node("//meta[@property='og:title']").try(&.["content"]) == original
  player = JSON.parse(document.xpath_node("//script[@id='player_data']").not_nil!.content)
  raise "Player title not original" unless player["title"] == original
  File.write("#{output}/original-title-watch.html", html)
  File.write("#{output}/original-title-embed.html", watch_fixture(env, nil, embed: true))
  preferences = env.get("preferences").as(Preferences)
  preferences.dearrow_enabled = true
  env.set "preferences", preferences
  File.write("#{output}/original-title-dearrow.html", watch_fixture(env, nil))

  env = spoiler_env("/watch?v=2isYuQZMbdU", dearrow: true, days: nil)
  env.set "original_title_selection", Invidious::OriginalTitles::Selection.new(true, client)
  html = watch_fixture(env, nil)
  document = XML.parse_html(html)
  raise "Spoiler title revealed" if document.xpath_node("//h1").try(&.content) == original
  raise "DeArrow original did not use selected title" unless document.xpath_node("//h1").try(&.["data-spoiler-original"]) == original
  File.write("#{output}/original-title-spoiler.html", html)

  env = signed_in_env(fixture_clip.permalink)
  env.set "original_title_selection", Invidious::OriginalTitles::Selection.new(true, client)
  html = watch_fixture(env, nil, account: true, native_clip: fixture_clip)
  raise "Custom clip title replaced" unless XML.parse_html(html).xpath_node("//h1").try(&.content) == fixture_clip.title
  File.write("#{output}/original-title-clip.html", html)
  puts "Original title settings, persistence, API selection, feeds, metadata, clips and spoiler checks passed"
end

# D5 exercises the same production projection as ordinary /watch and clip playback.
def desktop_watch_fixture(kind, mode = "light", locale = "en-US")
  account = {"owned", "queue-chat", "account", "bob"}.includes?(kind)
  video_id = kind == "second" ? "abcdefghijk" : "2isYuQZMbdU"
  env = account ? signed_in_env("/watch?v=#{video_id}") : fixture_env("/watch?v=#{video_id}", mode, locale: locale)
  prefs = env.get("preferences").as(Preferences)
  prefs.dark_mode = mode; prefs.locale = locale; prefs.listen = kind == "audio"
  env.set "preferences", prefs
  if account
    user = env.get("user").as(User); user.preferences = prefs; user.email = "bob@example.test" if kind == "bob"; env.set "user", user
  end
  video = fixture_video(video_id)
  video = audio_fixture_video if kind == "audio"
  if kind == "dash"
    # IDs match the locally encoded MPD; duplicate audio itags exercise identity.
    formats = JSON.parse(%([
      {"itag":0,"mimeType":"video/mp4; codecs=avc1.64000c","qualityLabel":"180p","width":320,"height":180,"fps":12,"bitrate":180000},
      {"itag":1,"mimeType":"video/mp4; codecs=avc1.640016","qualityLabel":"360p","width":640,"height":360,"fps":12,"bitrate":350000},
      {"itag":140,"mimeType":"audio/mp4; codecs=mp4a.40.2","bitrate":64000,"audioTrack":{"id":"en.4","displayName":"English original","audioIsDefault":true}},
      {"itag":140,"mimeType":"audio/mp4; codecs=mp4a.40.2","bitrate":64000,"isDrc":true,"audioTrack":{"id":"en.4","displayName":"English Stable Volume","audioIsDefault":true}},
      {"itag":140,"mimeType":"audio/mp4; codecs=mp4a.40.2","bitrate":64000,"audioTrack":{"id":"id.3","displayName":"Indonesian","audioIsDefault":false}}
    ]))
    video.info["streamingData"] = JSON.parse({adaptiveFormats: formats}.to_json)
    video.info["version"] = JSON::Any.new(Video::SCHEMA_VERSION.to_i64)
  end
  video.info["captions"] = JSON.parse("{}") if kind == "no-tools"
  video.info["title"] = JSON::Any.new("A long title with <markup> & literal </script> — 観察の記録 — ملاحظات " * 3) if kind == "long"
  plid = {"owned", "queue-chat"}.includes?(kind) ? "IVfixture" : kind == "queue" ? "PLfixture" : nil
  chat = {"replay", "queue-chat"}.includes?(kind)
  chat_only = {"transcript-only", "no-tools"}.includes?(kind)
  watch_fixture(env, plid, account: account, chat: chat, chat_only: chat_only, supplied_video: video,
    quality: kind == "dash" ? "dash" : "medium", aspect: kind == "portrait" ? "9:16" : "16:9",
    fallback_formats: kind == "quality" ? JSON.parse(%([
      {"itag":43,"mimeType":"video/webm; codecs=vp8","quality":"medium","height":180,"fps":12,"bitrate":120000},
      {"itag":44,"mimeType":"video/webm; codecs=vp8","quality":"large","height":360,"fps":12,"bitrate":250000}
    ])).as_a.map(&.as_h) : nil)
end

def write_watch_fixtures(output)
  {"light", "dark"}.each do |mode|
    {"single", "queue", "owned", "replay", "queue-chat", "transcript-only", "no-tools", "audio", "portrait", "dash", "quality", "account", "bob", "second", "long"}.each do |kind|
      source = desktop_watch_fixture(kind, mode)
      raise "D5 produced duplicate media" unless source.scan(/<video\b/).size == 1
      raise "D5 lost its production shell" unless source.includes?("data-overhaul") && source.includes?("data-page=\"watch\"")
      File.write("#{output}/d5-#{kind}-#{mode}.html", source)
    end
  end
  File.write("#{output}/d5-watch-rtl.html", desktop_watch_fixture("long", "dark", "ar"))
end

# D6 watch utilities use the production view and API HTML projections.
def write_watch_utility_fixtures(output)
  data = d3_thread_data.as_h.dup
  data.delete("authorId")
  data["videoId"] = JSON::Any.new("2isYuQZMbdU")
  data["comments"].as_a.each { |comment| comment.as_h.delete("attachment") }
  data["comments"].as_a[0].as_h["isPinned"] = JSON::Any.new(true)
  {"light", "dark"}.each do |mode|
    {"comments", "comments-disabled", "comments-thin", "comments-nojs"}.each do |kind|
      env = fixture_env("/watch?v=2isYuQZMbdU", mode)
      prefs = env.get("preferences").as(Preferences)
      prefs.comments = ["youtube", "reddit"]; prefs.thin_mode = kind == "comments-thin"; env.set "preferences", prefs
      video = fixture_video
      video.info["commentsEnabled"] = JSON::Any.new(false) if kind == "comments-disabled"
      source = watch_fixture(env, nil, supplied_video: video, nojs_comments: kind == "comments-nojs", initial_comment_html: Invidious::Frontend::Comments.template_youtube(JSON::Any.new(data), "en-US", prefs.thin_mode))
      File.write("#{output}/d6-#{kind}-#{mode}.html", source)
    end
  end
  File.write("#{output}/d6-comments-page.json", {"contentHtml" => Invidious::Frontend::Comments.template_youtube(JSON::Any.new(data), "en-US", false), "commentCount" => 3}.to_json)
  File.write("#{output}/d6-comments-thin.json", {"contentHtml" => Invidious::Frontend::Comments.template_youtube(JSON::Any.new(data), "en-US", true), "commentCount" => 3}.to_json)
  reddit = JSON.parse(%([{"kind":"t1","data":{"author":"A reader <literal>","body_html":"&lt;div&gt;&lt;p&gt;A thoughtful Reddit response.&lt;/p&gt;&lt;/div&gt;","score":12,"depth":0,"permalink":"/r/videos/comments/fixture/thread","created_utc":1700000000,"replies":{"kind":"Listing","data":{"modhash":"","children":[{"kind":"t1","data":{"author":"Another reader","body_html":"&lt;div&gt;&lt;p&gt;A nested response.&lt;/p&gt;&lt;/div&gt;","score":2,"depth":1,"permalink":"/r/videos/comments/fixture/reply","created_utc":1700000001,"replies":""}},{"kind":"more","data":{"children":["opaque-child"],"count":4,"depth":1}}]}}}}]))
  children = Array(RedditThing).from_json(reddit.to_json)
  File.write("#{output}/d6-reddit-page.json", {"contentHtml" => Invidious::Frontend::Comments.template_reddit(children, "en-US"), "title" => "An original video title must not be repeated in auxiliary labels", "permalink" => "/r/videos/comments/fixture/thread"}.to_json)
end

def chat_settings_fixture(account = false, mode = "light", locale = "en-US")
  env = account ? signed_in_env("/preferences?section=chat") : fixture_env("/preferences?section=chat", mode, locale: locale)
  preferences = env.get("preferences").as(Preferences)
  preferences.dark_mode = mode; preferences.locale = locale
  preferences.chat_show_timestamps = false
  preferences.chat_word_blacklist = "/spam/"
  preferences.chat_overlay_mode = true; preferences.chat_overlay_opacity = 0
  preferences.chat_overlay_x = 550; preferences.chat_overlay_width = 400
  env.set "preferences", preferences
  if account
    user = env.get("user").as(User); user.preferences = preferences; env.set "user", user
  end
  render "src/invidious/views/overhaul/chat_settings.ecr", "src/invidious/views/overhaul/shell.ecr"
end

def write_chat_settings_fixtures(output)
  {"light", "dark"}.each do |mode|
    File.write("#{output}/d6-chat-settings-guest-#{mode}.html", chat_settings_fixture(false, mode))
    File.write("#{output}/d6-chat-settings-account-#{mode}.html", chat_settings_fixture(true, mode))
  end
  File.write("#{output}/d6-chat-settings-rtl.html", chat_settings_fixture(false, "dark", "ar"))
end

# D6 clip editing uses 130-second real local media with a 120-second model.
def desktop_clip_editor_fixture(kind, mode = "light")
  env = signed_in_env("/watch?v=2isYuQZMbdU")
  prefs = env.get("preferences").as(Preferences)
  prefs.dark_mode = mode
  prefs.save_player_pos = true
  prefs.related_videos = kind != "empty"
  env.set "preferences", prefs
  video = fixture_video
  video.info["captions"] = JSON.parse("{}") if kind == "empty"
  user = env.get("user").as(User); user.preferences = prefs; env.set "user", user
  native_clip = nil.as(InvidiousClip?)
  if kind == "native"
    native_clip = fixture_clip
    native_clip.start_ms = 10250_i64
    native_clip.end_ms = 15250_i64
    native_clip.video_duration = 120
  end
  watch_fixture(env, kind == "queue" ? "PLfixture" : nil, account: true, chat: kind == "chat", clip_duration: 120, supplied_video: video, sync_positions: kind == "sync", native_clip: native_clip)
end

def write_clip_editor_fixtures(output)
  {"light", "dark"}.each do |mode|
    {"chat", "empty", "queue", "sync", "native"}.each do |kind|
      source = desktop_clip_editor_fixture(kind, mode)
      raise "D6 clip preview duplicated media" unless source.scan(/<video\b/).size == 1 && !source.includes?("clip-preview-frame")
      raise "D6 clip utility missing" unless source.includes?("tool-clip-editor")
      File.write("#{output}/d6-clip-#{kind}-#{mode}.html", source)
    end
  end
end

# Secondary clip pages use production templates and literal failed POST drafts.
def clip_secondary_fixture(kind, mode = "light", owner = true)
  clip = fixture_clip
  path = kind == "unavailable" ? clip.permalink : {"draft", "missing", "unconfirmed"}.includes?(kind) ? "/create_clip?videoId=#{clip.video_id}" : "/delete_clip?id=#{clip.id}"
  env = owner ? signed_in_env(path) : fixture_env(path, mode)
  preferences = env.get("preferences").as(Preferences)
  preferences.dark_mode = mode
  env.set "preferences", preferences
  locale = preferences.locale
  user = env.get?("user").try(&.as(User))
  csrf_token = "fixture-token"
  navbar_search = true
  if kind == "unavailable"
    render "src/invidious/views/clip_unavailable.ecr", "src/invidious/views/template.ecr"
  elsif {"draft", "missing", "unconfirmed"}.includes?(kind)
    env.request.method = "POST"
    video = kind == "missing" ? nil : fixture_video
    clip_source_available = kind != "missing"
    clip_unconfirmed = kind == "unconfirmed"
    env.params.body["videoId"] = clip.video_id
    clip_title = "  Kept <draft> 🎵  "
    clip_start_value = "001"
    clip_end_value = "00:60"
    clip_csrf = "fixture-token"
    error = kind == "unconfirmed" ? nil : kind == "missing" ? "Unable to load the source video." : "Select a valid range."
    render "src/invidious/views/create_clip.ecr", "src/invidious/views/template.ecr"
  else
    render "src/invidious/views/delete_clip.ecr", "src/invidious/views/template.ecr"
  end
end

def write_clip_secondary_fixtures(output)
  {"light", "dark"}.each do |mode|
    {"delete", "unavailable", "draft", "missing", "unconfirmed"}.each do |kind|
      File.write("#{output}/d6-clip-#{kind}-#{mode}.html", clip_secondary_fixture(kind, mode))
    end
    File.write("#{output}/d6-clip-unavailable-guest-#{mode}.html", clip_secondary_fixture("unavailable", mode, false))
  end
end

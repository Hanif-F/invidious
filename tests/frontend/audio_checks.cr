# Preference persistence and video-parameter resolution through production code.
def check_audio_preferences
  raise "Audio JSON default changed" unless Preferences.from_json("{}").preferred_audio == "original"
  raise "Audio YAML default changed" unless Preferences.from_yaml("{}").preferred_audio == "original"
  raise "Audio config default changed" unless ConfigPreferences.from_yaml("{}").preferred_audio == "original"
  {"unknown", "", "en.4"}.each do |value|
    raise "Invalid JSON audio accepted" unless Preferences.from_json({preferred_audio: value}.to_json).preferred_audio == "original"
    raise "Invalid YAML audio accepted" unless Preferences.from_yaml({"preferred_audio" => value}.to_yaml).preferred_audio == "original"
    raise "Invalid config audio accepted" unless ConfigPreferences.from_yaml({"preferred_audio" => value}.to_yaml).preferred_audio == "original"
  end
  {"null", "true", "123", "{}"}.each do |value|
    raise "Invalid audio type accepted" unless Preferences.from_json(%({"preferred_audio":#{value}})).preferred_audio == "original"
  end
  original = CONFIG.default_user_preferences.preferred_audio
  begin
    CONFIG.default_user_preferences.preferred_audio = "id"
    raise "Configured audio default lost" unless Preferences.from_json("{}").preferred_audio == "id" && Preferences.from_yaml("{}").preferred_audio == "id"
    raise "Configured video audio lost" unless Invidious::Videos.process_video_params(URI::Params.new, nil).preferred_audio == "id"
  ensure
    CONFIG.default_user_preferences.preferred_audio = original
  end

  {"original", "original_stable", "id", "pt-BR"}.each do |audio|
    prefs = Preferences.from_json({preferred_audio: audio}.to_json)
    raise "Audio JSON roundtrip lost" unless Preferences.from_json(prefs.to_json).preferred_audio == audio
    raise "Audio YAML roundtrip lost" unless Preferences.from_yaml(prefs.to_yaml).preferred_audio == audio
    raise "Configured audio rejected" unless ConfigPreferences.from_yaml({"preferred_audio" => audio}.to_yaml).preferred_audio == audio
    raise "Saved video audio lost" unless Invidious::Videos.process_video_params(URI::Params.new, prefs).preferred_audio == audio
    raise "Audio override lost" unless Invidious::Videos.process_video_params(URI::Params.parse("preferred_audio=pt-BR"), prefs).preferred_audio == "pt-BR"
    raise "Explicit original override lost" unless Invidious::Videos.process_video_params(URI::Params.parse("preferred_audio=original"), prefs).preferred_audio == "original"
    raise "Invalid audio override accepted" unless Invidious::Videos.process_video_params(URI::Params.parse("preferred_audio=invalid"), prefs).preferred_audio == "original"

    env = preferences_post_env("preferred_audio=#{audio}")
    Invidious::Routes::PreferencesRoute.update(env)
    raise "Guest audio lost" unless Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value)).preferred_audio == audio
    env = preferences_post_env("")
    env.set "preferences", prefs
    Invidious::Routes::PreferencesRoute.update(env)
    raise "Older form erased audio" unless Preferences.from_json(URI.decode_www_form(env.response.cookies["PREFS"].value)).preferred_audio == audio

    user = signed_in_env("/preferences").get("user").as(User)
    env = preferences_post_env("preferred_audio=#{audio}")
    env.set "user", user
    Invidious::Routes::PreferencesRoute.update(env)
    saved = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "Account audio lost" unless saved.preferred_audio == audio
    env = preferences_post_env(prefs.to_json, "application/json")
    env.set "user", user
    Invidious::Routes::API::V1::Authenticated.set_preferences(env)
    saved = Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String))
    raise "API audio lost" unless saved.preferred_audio == audio
    user.preferences = saved
    env.set "user", user
    raise "GET API audio lost" unless JSON.parse(Invidious::Routes::API::V1::Authenticated.get_preferences(env))["preferred_audio"].as_s == audio
    exported = JSON.parse(Invidious::User::Export.to_invidious(user))
    raise "Exported audio lost" unless exported["preferences"]["preferred_audio"].as_s == audio
    Invidious::User::Import.from_invidious(user, {preferences: exported["preferences"]}.to_json)
    raise "Imported audio lost" unless Preferences.from_json(PG_DB.query_one("SELECT preferences FROM users WHERE email = ?", user.email, as: String)).preferred_audio == audio
  end
  puts "Audio preference persistence and URL/default resolution checks passed"
end

# Use the same duplicate itag for every language/processing variant.
def audio_fixture_video
  video = fixture_video
  formats = [
    {"en-US.4", "English original", true, false, 128000},
    {"en-US.4", "English original", true, true, 120000},
    {"id.3", "Indonesian", false, false, 96000},
    {"id.3", "Indonesian", false, false, 64000},
  ].map do |tag, name, original, stable, bitrate|
    itag = bitrate == 64000 ? 139 : 140
    JSON.parse({itag: itag, mimeType: "audio/mp4; codecs=\"mp4a.40.2\"", bitrate: bitrate,
                isDrc: stable, audioTrack: {id: tag, displayName: name, audioIsDefault: original},
                url: "https://rr1.googlevideo.com/videoplayback?itag=#{itag}&lang=#{tag}&drc=#{stable}&rate=#{bitrate}"}.to_json)
  end
  video.info["streamingData"] = JSON.parse({adaptiveFormats: formats}.to_json)
  video.info["version"] = JSON::Any.new(Video::SCHEMA_VERSION.to_i64)
  video
end

def check_audio_playback(output)
  video = audio_fixture_video
  PG_DB.exec("UPDATE videos SET info = ?, updated = ? WHERE id = ?", video.info.to_json, Time.utc, video.id)
  companions = CONFIG.invidious_companion
  begin
    {false, true}.each do |companion|
      CONFIG.invidious_companion = companion ? [Config::CompanionConfig.from_yaml("private_url: http://companion.test\npublic_url: /companion\n")] : [] of Config::CompanionConfig
      {false, true}.each do |local|
        { {"id.3", false}, {"en-US.4", true}, {"gone.3", false} }.each do |tag, stable|
          query = URI::Params.new
          query["id"] = video.id
          query["itag"] = "140"
          query["audio_track"] = tag
          query["is_drc"] = stable.to_s
          query["local"] = local.to_s
          env = fixture_env("/latest_version?#{query}")
          Invidious::Routes::VideoPlayback.latest_version(env)
          destination = URI.parse(env.response.headers["Location"])
          expected_tag = tag == "gone.3" ? "en-US.4" : tag
          raise "Wrong audio redirect: #{destination}" unless destination.query_params["lang"] == expected_tag && destination.query_params["drc"] == stable.to_s
          raise "Companion swallowed selector" if destination.path.includes?("latest_version")
          raise "Proxy omitted host" if local && (destination.host || destination.query_params["host"]? != "rr1.googlevideo.com")
          raise "Unexpected media host" if !local && destination.host != "rr1.googlevideo.com"
        end
      end
      if companion
        env = fixture_env("/latest_version?id=#{video.id}&itag=140")
        Invidious::Routes::VideoPlayback.latest_version(env)
        raise "Legacy Companion redirect changed" unless env.response.headers["Location"].starts_with?("/companion/latest_version?")
      end
    end
  ensure
    CONFIG.invidious_companion = companions
  end

  {"id", "original_stable", "fr"}.each do |choice|
    {false, true}.each do |embed|
      env = fixture_env(embed ? "/embed/#{video.id}" : "/watch?v=#{video.id}")
      prefs = env.get("preferences").as(Preferences)
      prefs.listen = true
      prefs.preferred_audio = choice
      env.set "preferences", prefs
      html = watch_fixture(env, nil, embed: embed, supplied_video: video)
      sources = XML.parse_html(html).xpath_nodes("//video/source")
      expected_tag = choice == "id" ? "id.3" : "en-US.4"
      sources.each do |source|
        query = URI.parse(source["src"]).query_params
        raise "Source lost audio identity" unless query["audio_track"] == expected_tag && query["is_drc"] == (choice == "original_stable").to_s
      end
      selected = sources.select { |source| source["selected"]? == "true" }
      raise "Audio default missing" unless selected.size == 1
      raise "Audio bitrate default wrong" unless selected.first["label"] == (choice == "id" ? "96000k" : choice == "original_stable" ? "120000k" : "128000k")
      File.write("#{output}/#{embed ? "embed" : "watch"}-audio-#{choice}.html", html)
    end
  end
  puts "Audio-only watch/embed sources and exact redirects with/without Companion and proxy passed"
end

# S15 production player/template projection with synthetic local content only.
def write_embed_surface_fixtures(output)
  {"light", "dark", "rtl"}.each do |variant|
    mode, locale = variant == "rtl" ? {"dark", "ar"} : {variant, "en-US"}
    {"single", "private", "playlist", "series", "audio", "dash", "masked", "preview", "portrait", "long", "live", "no-controls"}.each do |kind|
      path = "/embed/2isYuQZMbdU"
      account = {"masked", "private"}.includes?(kind)
      env = account ? account_surface_env(path, mode, locale) : fixture_env(path, mode, locale: locale)
      preferences = env.get("preferences").as(Preferences)
      preferences.listen = kind == "audio"
      video = kind == "audio" ? audio_fixture_video : fixture_video
      video.info["title"] = JSON::Any.new(%(A literal </script><img src=x onerror="window.injected=true"> & title مقطع))
      if kind == "masked"
        preferences.channel_spoiler_settings = {video.ucid => Invidious::ChannelSpoilers::Rule.new("Studio North", true, true)}
        preferences.dearrow_enabled = true
      end
      if kind == "long"
        captions_data = video.info["captions"]["playerCaptionsTracklistRenderer"]["captionTracks"].as_a
        captions_data[0]["name"].as_h["simpleText"] = JSON::Any.new(%(Caption " onload="window.injected=true <literal> & مقطع))
      elsif kind == "live"
        preferences.local = true
        video.info["videoType"] = JSON::Any.new("Livestream")
        video.info["streamingData"] = JSON.parse({hlsManifestUrl: "https://manifest.googlevideo.com/api/manifest/hls_variant/id/fixture?opaque=opaque%2Bvalue%3D&keep=1"}.to_json)
      end
      if kind == "dash"
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
      env.set "preferences", preferences
      if user = env.get?("user").try(&.as(User))
        user.preferences = preferences
        env.set "user", user
      end
      saved_required = CONFIG.login_required
      CONFIG.login_required = kind == "private"
      source = watch_fixture(env, kind == "playlist" ? "IVfixture" : nil, embed: true, account: account, supplied_video: video,
        player_controls: kind != "no-controls", quality: kind == "dash" ? "dash" : "medium", aspect: kind == "portrait" ? "9:16" : "16:9",
        video_series: kind == "series" ? ["2isYuQZMbdU", "2isYuQZMbdU", "nextvideo01"] : nil,
        preview_range: kind == "preview" ? {1.0, 6.0} : nil)
      CONFIG.login_required = saved_required
      document = XML.parse_html(source)
      raise "Embed duplicated media or navigation" unless document.xpath_nodes("//video").size == 1 && document.xpath_nodes("//*[contains(@class,'app-sidebar')]").empty?
      raise "Embed retained legacy design dependency" if source.includes?("/css/default.css") || source.includes?("pure-min") || source.includes?("diary")
      raise "Embed serialized executable source title" if source.includes?("</script><img src=x")
      if kind == "long"
        track = document.xpath_node("//track").not_nil!
        raise "Caption labels injected an attribute" if track["onload"]? || track["onerror"]?
        label = URI::Params.parse(URI.parse(track["src"]).query.not_nil!)["label"]
        raise "Caption URL lost its literal label" unless label == track["label"] && label.includes?(%q(onload="window.injected))
      elsif kind == "live"
        source_url = URI.parse(document.xpath_node("//video/source").not_nil!["src"])
        query = URI::Params.parse(source_url.query.not_nil!)
        raise "Live HLS source corrupted existing query" unless query["opaque"] == "opaque+value=" && query["keep"] == "1" && query["local"] == "true"
      end
      if kind == "preview"
        data = JSON.parse(document.xpath_node("//script[@id='video_data']").not_nil!.content)
        raise "Embed preview lost its immutable range/isolation" unless data["clip"]["startTime"] == 1.0 && data["clip"]["endTime"] == 6.0 && !data["playback_sync"].as_bool && data["plid"].raw.nil?
      end
      File.write("#{output}/d7-embed-#{kind}-#{variant}.html", source)
      blocked = [] of String
      owner = Invidious::Frontend::EnhancementState.snapshot(preferences, Invidious::BrowserProfiles.render_scope(env), !!env.get?("user"), blocked, HMAC_KEY)
      File.write("#{output}/d7-embed-owner-#{kind}-#{variant}.json", owner.to_json)
    end
    previous = CONFIG.login_required
    begin
      CONFIG.login_required = true
      io = IO::Memory.new
      env = HTTP::Server::Context.new(HTTP::Request.new("GET", "/embed/2isYuQZMbdU?list=IVprivate&index=2&occurrence=9223372036854775807&listen=true&clip_preview=1&start=1&end=6"), HTTP::Server::Response.new(io))
      env.set "preferences", Preferences.from_json({"dark_mode" => mode, "locale" => locale}.to_json)
      env.set "authentication_resolved", true
      Invidious::HttpServer::RequiredLoginHandler.new.call(env)
      env.response.close
      response = HTTP::Client::Response.from_io(IO::Memory.new(io.to_s))
      raise "Embedded login lost status or content restrictions" unless response.status_code == 401 && !response.body.includes?("<script") && response.headers["Content-Security-Policy"] == "default-src 'none'; style-src 'self'; frame-ancestors *"
      File.write("#{output}/d7-embed-login-#{variant}.html", response.body)
    ensure
      CONFIG.login_required = previous unless previous.nil?
    end
  end
  puts "S15 production embed fixtures: shared controls, escaped metadata/JSON, preview bounds, profile owner and framed login recovery passed"
end

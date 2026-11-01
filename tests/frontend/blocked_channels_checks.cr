# Production HTML fixtures with SQLite-only account-owned channel data.
def write_blocked_channels_fixtures(output)
  PG_DB.exec("CREATE TABLE IF NOT EXISTS blocked_channels (email TEXT NOT NULL, ucid TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(email, ucid))")
  {"light", "dark"}.each do |mode|
    {"filled", "empty", "invalid", "expired", "stale", "uncertain", "unavailable"}.each do |kind|
      env = signed_in_env("/blocked_channels")
      user = env.get("user").as(User)
      prefs = env.get("preferences").as(Preferences)
      prefs.dark_mode = mode
      user.preferences = prefs
      env.set "user", user
      env.set "preferences", prefs
      env.set "sid", "fixture-session"
      PG_DB.exec("DELETE FROM blocked_channels WHERE email = ?", user.email)
      unless kind == "empty"
        {"<Channel> العربية 日本語", "Alpha", "Alpha", "LongCreator" * 15, "Studio North", "Known channel"}.each_with_index do |name, index|
          Invidious::Database::BlockedChannels.block(user.email, "UC" + ('a'.ord + index).chr.to_s * 22, name)
        end
      end
      fields = {"ucid" => "UC" + "a" * 22, "action" => "unblock", "name" => "<Requested channel>", "csrf_token" => Invidious::Helpers::Tokens.generate_response("fixture-session", {"POST:blocked_channels"}, HMAC_KEY), "browser_profile" => Invidious::BrowserProfiles.account_scope(user.email)}
      fields["browser_profile"] = "earlier-profile" if kind == "stale"
      fields["csrf_token"] = "expired" if kind == "expired"
      fields["action"] = "invalid<draft>&" if kind == "invalid"
      html = if {"invalid", "expired", "stale"}.includes?(kind)
               post = HTTP::Server::Context.new(HTTP::Request.new("POST", "/blocked_channels", HTTP::Headers{"Content-Type" => "application/x-www-form-urlencoded"}, URI::Params.encode(fields)), HTTP::Server::Response.new(IO::Memory.new))
               %w(user preferences sid csrf_token).each { |key| post.set key, env.get(key) }
               Invidious::BrowserProfiles.publish(post, Invidious::BrowserProfiles.account_scope(user.email))
               Invidious::Routes::BlockedChannels.update(post)
             else
               if kind == "uncertain"
                 env.set "blocked_error", I18n.translate(prefs.locale, "overhaul_blocks_unconfirmed")
                 env.set "blocked_uncertain", true
                 env.set "blocked_draft", URI::Params.encode(fields)
               end
               if kind == "unavailable"
                 PG_DB.exec("ALTER TABLE blocked_channels RENAME TO blocked_channels_fixture_saved")
                 begin
                   Invidious::Routes::BlockedChannels.index(env)
                 ensure
                   PG_DB.exec("ALTER TABLE blocked_channels_fixture_saved RENAME TO blocked_channels")
                 end
               else
                 Invidious::Routes::BlockedChannels.index(env)
               end
             end
      File.write("#{output}/d6-blocks-#{kind}-#{mode}.html", html)
    end
  end
end

# Contextual actions use actual Popular filtering and the shared library rows.
def block_context_fixture(path : String, blocked = false)
  env = signed_in_env(path)
  prefs = env.get("preferences").as(Preferences)
  prefs.dark_mode = "light"
  prefs.ai_filter_enabled = false
  prefs.dearrow_enabled = false
  env.set "preferences", prefs
  env.set "blocked_channels", blocked ? ["UC" + "a" * 22] : [] of String
  locale = prefs.locale
  navbar_search = true
  page_nav_html = ""
  samples = (0...6).map do |index|
    ChannelVideo.new({title: "A safe contextual action #{index + 1}", id: index.to_s.rjust(11, '0'), author: "Studio North", ucid: "UC" + "a" * 22, published: Time.utc - 2.days, updated: Time.utc, views: 123_i64, length_seconds: 720, live_now: false, premiere_timestamp: nil, members_only: false})
  end
  if path == "/feed/popular"
    before = Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.get
    begin
      Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.set(samples)
      render "src/invidious/views/feeds/popular.ecr", "src/invidious/views/template.ecr"
    ensure
      Invidious::Jobs::PullPopularVideosJob::POPULAR_VIDEOS.set(before)
    end
  else
    items = samples
    render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
  end
end

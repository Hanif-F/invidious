# Real watch page and player; browser tests intercept all reads and votes.
def write_contribution_editor_fixtures(output)
  key_before = CONFIG.dearrow_identity_key
  {"light", "dark"}.each do |mode|
    {"regular", "masked", "guest", "setup"}.each do |kind|
      CONFIG.dearrow_identity_key = kind == "setup" ? "" : "ab" * 32
      env = kind == "guest" ? fixture_env("/watch?v=2isYuQZMbdU", mode) : signed_in_env("/watch?v=2isYuQZMbdU")
      video = fixture_video
      prefs = env.get("preferences").as(Preferences)
      prefs.dark_mode = mode
      prefs.dearrow_enabled = false # Contributions remain independent of replacement.
      if kind == "masked"
        prefs.channel_spoiler_settings = {video.ucid => Invidious::ChannelSpoilers::Rule.new("Studio North", true, true)}
      end
      env.set "preferences", prefs
      File.write("#{output}/d6-contribution-#{kind}-#{mode}.html", watch_fixture(env, nil, account: kind != "guest", supplied_video: video))
    end
  end
ensure
  CONFIG.dearrow_identity_key = key_before if key_before
end

def progress_env(path, theme = "modern-neon", thin = false)
  env = signed_in_env(path)
  prefs = env.get("preferences").as(Preferences)
  prefs.save_player_pos = true
  prefs.thin_mode = thin
  prefs.theme = theme
  user = env.get("user").as(User)
  user.preferences = prefs
  user.watched = ["progress001"]
  env.set "preferences", prefs
  env.set "user", user
  env
end

# The four video types used by browse/channel/feed/search/playlist/mix pages.
def progress_cards_fixture(theme = "modern-neon", thin = false)
  env = progress_env("/playlist?list=PLfixture", theme, thin)
  locale = "en-US"
  items = [
    SearchVideo.new({title: "Search and channel video", id: "progress001", author: "Studio North", ucid: "UCfixture", published: Time.utc, views: 100_i64, description_html: "", length_seconds: 1000, premiere_timestamp: nil, author_verified: false, author_thumbnail: nil, badges: VideoBadges::None}),
    ChannelVideo.new({title: "Feed video", id: "progress001", author: "Studio North", ucid: "UCfixture", published: Time.utc, updated: Time.utc, views: 100_i64, length_seconds: 1000, live_now: false, premiere_timestamp: nil, members_only: false}),
    PlaylistVideo.new({title: "Playlist video", id: "progress001", author: "Studio North", ucid: "UCfixture", published: Time.utc, length_seconds: 1000, plid: "PLfixture", index: 2_i64, live_now: false, members_only: false}),
    MixVideo.new({title: "Mix video", id: "progress001", author: "Studio North", ucid: "UCfixture", length_seconds: 1000, rdid: "RDfixture", index: 3, members_only: false}),
  ]
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

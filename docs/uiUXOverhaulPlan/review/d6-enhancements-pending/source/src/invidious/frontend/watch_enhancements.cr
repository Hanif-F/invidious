# Presentation refresh for an existing watch document. This reads the cached
# source video, never get_video/streams/history, and uses the same collection
# enhancement budgets as an ordinary watch page. Queue occurrences stay client
# owned; only their selected title/thumbnail presentation is returned.
module Invidious::Frontend::WatchEnhancements
  extend self

  def configuration(preferences : Preferences, blocked : Array(String))
    {
      locale: preferences.locale, showMemberVideos: preferences.show_member_videos,
      showOriginalTitle: preferences.show_original_title, blockedChannels: blocked.sort.uniq,
      ai: Invidious::WebPreferences.values("ai-filter", JSON.parse(preferences.to_json).as_h),
    }
  end

  def recommendations(env, video : Video)
    items = BlockedChannels.recommendations(video.related_videos, BlockedChannels.ids(env))
    items = AiChannels.recommendations(items, env)
    MemberVideos.recommendations(items, env.get("preferences").as(Preferences).show_member_videos)
  end

  def render_recommendations(env, related_videos, listen = false)
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale
    user = env.get?("user").try(&.as(User))
    params = Invidious::Videos.process_video_params(URI::Params.parse("listen=#{listen ? 1 : 0}"), preferences)
    render "src/invidious/views/overhaul/watch_recommendations.ecr"
  end

  def projection(env, video : Video, ids : Array(String), channels : Array(String), listen = false)
    related_videos = recommendations(env, video)
    ChannelSpoilers.prepare_recommendations(env, related_videos)
    ViewCounts.prepare_recommendations(env, video, related_videos)
    ChannelAvatars.prepare_ids(env, related_videos.compact_map { |item| item["ucid"]? })
    html = render_recommendations(env, related_videos, listen)
    # The existing request-local selection coalesces duplicate IDs and shares
    # its deadline. Disabled originals and AI perform no provider work.
    Invidious::OriginalTitles.prepare(env, ids)
    titles = Invidious::OriginalTitles.selection(env).titles.select { |id, _| ids.includes?(id) }
    thumbnails = AiChannels.prepare_ids(env, channels).to_h do |id, kind|
      {id, AiChannels.render_thumbnail(kind, env.get("preferences").as(Preferences).locale, compact: true)}
    end
    {recommendations: html, nextVideo: related_videos.find { |item| item["id"]? }.try(&.["id"]), titles: titles, queueThumbnails: thumbnails}
  end
end

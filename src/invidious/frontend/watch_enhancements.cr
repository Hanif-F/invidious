module Invidious::Frontend::WatchEnhancements
  extend self

  def recommendations(env, video : Video)
    items = BlockedChannels.recommendations(video.related_videos, BlockedChannels.ids(env))
    items = AiChannels.recommendations(items, env)
    MemberVideos.recommendations(items, env.get("preferences").as(Preferences).show_member_videos)
  end
end

module Invidious::Frontend::MemberVideos
  extend self

  def show?(env) : Bool
    override = env.get?("show_member_videos")
    return override.as(Bool) unless override.nil?
    env.get("preferences").as(Preferences).show_member_videos
  end

  def visible?(item, show : Bool) : Bool
    show || !(item.responds_to?(:members_only) && item.members_only)
  end

  def filter(items, show : Bool)
    items.select { |item| visible?(item, show) }
  end

  def recommendations(items, show : Bool)
    items.reject { |item| !show && item["members_only"]? == "true" }
  end

  def queue_videos(items : Array(JSON::Any), show : Bool)
    items.reject { |item| !show && item["isMember"]?.try(&.as_bool?) == true }
  end
end

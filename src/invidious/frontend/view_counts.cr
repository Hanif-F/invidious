require "../videos/view_counts"

add_context_storage_type(Hash(String, Invidious::Videos::ViewCounts::Count?))

module Invidious::Frontend::ViewCounts
  extend self
  alias Counts = Invidious::Videos::ViewCounts

  def prepare(env, items)
    supplied = {} of String => Counts::Count?
    items.each do |item|
      if item.is_a?(Video | SearchVideo | ChannelVideo | PlaylistVideo | MixVideo)
        supplied[item.id] ||= Counts.from_item(item)
      elsif item.is_a?(Invidious::Database::WatchHistory::Entry | InvidiousClip)
        supplied[item.video_id] ||= nil
      end
    end
    prepare_counts(env, supplied)
  end

  def prepare_recommendations(env, video : Video, items : Array(Hash(String, String)))
    supplied = {video.id => Counts.from_item(video)}
    items.each { |item| supplied[item["id"]] ||= Counts.from_related(item) if item["id"]? }
    prepare_counts(env, supplied)
  end

  def prepare_counts(env, supplied : Hash(String, Counts::Count?))
    previous = env.get?("view_counts").try(&.as(Hash(String, Counts::Count?))) || {} of String => Counts::Count?
    pending = supplied.reject { |id, count| count.nil? && previous.has_key?(id) }
    available = Counts.resolve(pending) { |ids| Invidious::Database::Videos.select_view_counts(ids) }
    env.set "view_counts", previous.merge(available)
  end

  def get(env, id : String) : Counts::Count?
    env.get?("view_counts").try(&.as(Hash(String, Counts::Count?))[id]?)
  end
end

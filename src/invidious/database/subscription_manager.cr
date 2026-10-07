require "./base.cr"

module Invidious::Database::SubscriptionManager
  extend self

  # Only read existing local data. Opening the manager must not backfill history
  # or fetch channel/video metadata from YouTube.
  def select(user : User, show_members : Bool, now : Time = Time.utc) : Hash(String, Frontend::SubscriptionManager::Stats)
    stats = user.subscriptions.to_h { |id| {id, Frontend::SubscriptionManager::Stats.new} }
    return stats if stats.empty?

    PG_DB.query_all(<<-SQL, user.subscriptions, user.watched, now, show_members, as: {String, Time?, Time?}).each do |id, latest, fresh|
      SELECT ucid, MAX(published),
        MAX(published) FILTER (WHERE NOT (id = ANY($2)) AND published > $3::timestamptz - INTERVAL '7 days')
      FROM channel_videos
      WHERE ucid = ANY($1) AND published <= $3
        AND (premiere_timestamp IS NULL OR premiere_timestamp <= $3)
        AND ($4 OR NOT members_only)
      GROUP BY ucid
      SQL
      stats[id].latest_upload = latest
      stats[id].fresh_upload = fresh
    end

    return stats if user.watched.empty?
    entries = WatchHistory.select_all(user.email).to_h { |entry| {entry.video_id, entry} }
    ids = user.watched.uniq
    missing = ids.select { |id| !WatchHistory.present(entries[id]?.try(&.channel_id)) }
    cached = WatchHistory.cached(missing)
    today = Time.parse(Invidious::History.today(user.preferences.timezone, now), "%F", Time::Location::UTC)
    ids.each do |id|
      entry = entries[id]?
      channel_id = WatchHistory.present(entry.try(&.channel_id)) || cached[id]?.try(&.channel_id)
      next unless channel_id
      next unless data = stats[channel_id]?
      data.record_watch(entry.try(&.latest_watched), entry.try(&.archived_dates) || [] of String, today)
    end
    stats
  end
end

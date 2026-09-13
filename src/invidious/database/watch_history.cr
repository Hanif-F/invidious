require "./base.cr"

module Invidious::Database::WatchHistory
  extend self

  struct Entry
    include JSON::Serializable
    property video_id : String
    property title : String?
    property channel_name : String?
    property channel_id : String?
    property release_date : String?
    property latest_watched : String?
    property archived_dates : Array(String) = [] of String

    def initialize(@video_id, @title = nil, @channel_name = nil, @channel_id = nil, @release_date = nil, @latest_watched = nil, @archived_dates = [] of String)
    end
  end

  # Read only local caches. Dates missing from video.info must remain unknown.
  def cached(ids : Array(String)) : Hash(String, Entry)
    result = {} of String => Entry
    return result if ids.empty?
    PG_DB.query_all(<<-SQL, ids, as: {String, String?, String?, String?, String?}).each do |id, title, author, ucid, published|
      SELECT id, title, author, ucid, to_char(published AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      FROM channel_videos WHERE id = ANY($1)
      UNION ALL
      SELECT id, info::json->>'title', info::json->>'author', info::json->>'ucid', info::json->>'published'
      FROM videos WHERE id = ANY($1)
      SQL
      old = result[id]? || Entry.new(id)
      result[id] = Entry.new(id, present(title) || old.title, present(author) || old.channel_name,
        present(ucid) || old.channel_id, History.date(published) || old.release_date)
    end
    result
  end

  def present(value : String?) : String?
    value unless value.nil? || value.blank?
  end

  def select_all(email : String, conn = PG_DB) : Array(Entry)
    conn.query_all("SELECT row_to_json(h)::text FROM (SELECT video_id, title, channel_name, channel_id, release_date, latest_watched, archived_dates FROM watch_history WHERE email = $1) h", email, as: String).map { |json| Entry.from_json(json) }
  end

  def save(conn : DB::Connection, email : String, entry : Entry)
    conn.exec <<-SQL, email, entry.video_id, present(entry.title), present(entry.channel_name), present(entry.channel_id), History.date(entry.release_date), History.date(entry.latest_watched), entry.archived_dates.compact_map { |d| History.date(d) }.reject { |d| d == History.date(entry.latest_watched) }.uniq.sort
      INSERT INTO watch_history AS h (email, video_id, title, channel_name, channel_id, release_date, latest_watched, archived_dates)
      VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::date[])
      ON CONFLICT (email, video_id) DO UPDATE SET
        title = COALESCE(EXCLUDED.title, h.title),
        channel_name = COALESCE(EXCLUDED.channel_name, h.channel_name),
        channel_id = COALESCE(EXCLUDED.channel_id, h.channel_id),
        release_date = COALESCE(EXCLUDED.release_date, h.release_date),
        latest_watched = COALESCE(EXCLUDED.latest_watched, h.latest_watched),
        archived_dates = ARRAY(SELECT DISTINCT d FROM unnest(h.archived_dates || EXCLUDED.archived_dates || ARRAY[h.latest_watched]) d
          WHERE d IS NOT NULL AND d IS DISTINCT FROM COALESCE(EXCLUDED.latest_watched, h.latest_watched) ORDER BY d)
      SQL
  end

  def record(user : User, id : String, video : Video? = nil)
    entry = cached([id])[id]? || Entry.new(id)
    if video
      entry.title = present(video.title) || entry.title
      entry.channel_name = present(video.author) || entry.channel_name
      entry.channel_id = present(video.ucid) || entry.channel_id
      entry.release_date = History.date(video.info["published"]?.try(&.as_s?)) || entry.release_date
    end
    PG_DB.transaction do |tx|
      conn = tx.connection
      preferences = conn.query_one("SELECT preferences FROM users WHERE email = $1 FOR UPDATE", user.email, as: String)
      entry.latest_watched = History.today(Preferences.from_json(preferences).timezone)
      conn.exec("UPDATE users SET watched = array_append(array_remove(watched, $1), $1) WHERE email = $2", id, user.email)
      save(conn, user.email, entry)
    end
  end

  # Persist recovered cache metadata so subsequent cache expiry cannot remove it.
  def entries(user : User) : Array(Entry)
    return [] of Entry if user.watched.empty?
    existing = select_all(user.email).to_h { |entry| {entry.video_id, entry} }
    missing = user.watched.select { |id| !(entry = existing[id]?) || !entry.title || !entry.channel_name || !entry.channel_id || !entry.release_date }
    cached_entries = cached(missing)
    result = [] of Entry
    PG_DB.transaction do |tx|
      conn = tx.connection
      ids = conn.query_one("SELECT watched FROM users WHERE email = $1 FOR UPDATE", user.email, as: Array(String))
      saved = select_all(user.email, conn).to_h { |entry| {entry.video_id, entry} }
      ids.each do |id|
        entry = saved[id]? || Entry.new(id)
        if fallback = cached_entries[id]?
          entry.title ||= fallback.title
          entry.channel_name ||= fallback.channel_name
          entry.channel_id ||= fallback.channel_id
          entry.release_date ||= fallback.release_date
        end
        save(conn, user.email, entry) unless saved[id]?.try(&.to_json) == entry.to_json
        result << entry
      end
    end
    result
  end

  def import(user : User, values : Array(JSON::Any))
    return if values.empty?
    PG_DB.transaction do |tx|
      conn = tx.connection
      ids = conn.query_one("SELECT watched FROM users WHERE email = $1 FOR UPDATE", user.email, as: Array(String))
      existing = select_all(user.email, conn).to_h { |entry| {entry.video_id, entry} }
      values.each do |value|
        begin
          entry = Entry.from_json(value.to_json)
          next unless ids.includes?(entry.video_id)
          entry.latest_watched = History.date(entry.latest_watched)
          if old = existing[entry.video_id]?
            dates = (old.archived_dates + entry.archived_dates + [old.latest_watched, entry.latest_watched].compact).compact_map { |d| History.date(d) }.uniq.sort
            entry.latest_watched = [old.latest_watched, entry.latest_watched].compact.max?
            entry.archived_dates = dates.reject { |d| d == entry.latest_watched }
          end
          save(conn, user.email, entry)
          existing[entry.video_id] = entry
        rescue JSON::ParseException | JSON::SerializableError
          next
        end
      end
    end
  end
end

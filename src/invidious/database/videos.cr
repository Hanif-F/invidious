require "./base.cr"
require "../videos/view_counts"

module Invidious::Database::Videos
  extend self

  def insert(video : Video)
    request = <<-SQL
      INSERT INTO videos
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO NOTHING
      SQL

    PG_DB.exec(request, video.id, video.info.to_json, video.updated)
  end

  def delete(id)
    request = <<-SQL
      DELETE FROM videos *
      WHERE id = $1
      SQL

    PG_DB.exec(request, id)
  end

  def delete_expired
    request = <<-SQL
      DELETE FROM videos *
      WHERE updated < (now() - interval '6 hours')
      SQL

    PG_DB.exec(request)
  end

  def update(video : Video)
    request = <<-SQL
      UPDATE videos
      SET (id, info, updated) = ($1, $2, $3)
      WHERE id = $1
      SQL

    PG_DB.exec(request, video.id, video.info.to_json, video.updated)
  end

  def select(id : String) : Video?
    request = <<-SQL
      SELECT * FROM videos
      WHERE id = $1
      SQL

    return PG_DB.query_one?(request, id, as: Video)
  end

  def select_metadata(ids : Array(String)) : Hash(String, JSON::Any)
    metadata = {} of String => JSON::Any
    return metadata if ids.empty?
    PG_DB.query_all("SELECT id, info FROM videos WHERE id = ANY($1)", ids, as: {String, String}).each do |id, info|
      begin
        metadata[id] = JSON.parse(info)
      rescue JSON::ParseException
        # A broken optional cache entry must not prevent loading the channel.
      end
    end
    metadata
  end

  # Read existing caches only, with the newest usable observation first. This
  # must not use get_video, whose cache-miss/error path fetches from YouTube.
  def select_view_counts(ids : Array(String), db = PG_DB) : Hash(String, Invidious::Videos::ViewCounts::Count)
    counts = {} of String => Invidious::Videos::ViewCounts::Count
    return counts if ids.empty?
    db.query_all(<<-SQL, ids.uniq, as: {String, String?, Int64?, Bool?, Time?, Int32}).each do |id, info, views, live, _updated, _source|
      SELECT id, info, NULL::bigint, FALSE, updated, 0 AS source_rank FROM videos WHERE id = ANY($1)
      UNION ALL
      SELECT id, NULL, views, live_now, updated, 1 AS source_rank FROM channel_videos WHERE id = ANY($1)
      ORDER BY updated DESC NULLS LAST, source_rank
      SQL
      next if counts.has_key?(id)
      count = if info
                begin
                  JSON.parse(info).as_h?.try { |data| Invidious::Videos::ViewCounts.from_info(data) }
                rescue JSON::ParseException
                  nil
                end
              elsif !live
                # Legacy channel rows have no precision/type provenance. Never
                # reuse an ambiguous live row as a cumulative view count.
                Invidious::Videos::ViewCounts.numeric(views, kind: "views")
              end
      counts[id] = count if count
    end
    counts
  rescue
    # A cache outage must neither fail the page nor trigger an upstream retry.
    counts || {} of String => Invidious::Videos::ViewCounts::Count
  end

  # Presentation-only fallback for lists that omit upload dates. Read both
  # existing caches in one query; never refresh videos or channels here.
  def select_spoiler_dates(ids : Array(String)) : Hash(String, Time?)
    dates = {} of String => Time?
    return dates if ids.empty?
    PG_DB.query_all(<<-SQL, ids, as: {String, String?}).each do |id, published|
      SELECT id, CASE WHEN info::json->>'publishedIsKnown' = 'true'
        THEN COALESCE(info::json->>'sourcePublished', info::json->>'published') END
      FROM videos WHERE id = ANY($1)
      UNION ALL
      SELECT id, to_char(published AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      FROM channel_videos WHERE id = ANY($1)
      SQL
      dates[id] ||= Invidious::ChannelSpoilers.publication(published)
    end
    dates
  end

  # Only read metadata already cached locally; never refresh videos from YouTube.
  def select_titles(ids : Array(String)) : Hash(String, String)
    titles = {} of String => String
    return titles if ids.empty?

    request = <<-SQL
      SELECT id, title FROM channel_videos WHERE id = ANY($1)
      UNION ALL
      SELECT id, info::json ->> 'title' FROM videos WHERE id = ANY($1)
      SQL
    PG_DB.query_all(request, ids, as: {String, String?}).each do |id, title|
      titles[id] = title unless title.nil? || title.blank?
    end
    titles
  end
end

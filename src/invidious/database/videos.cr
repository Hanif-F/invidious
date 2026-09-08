require "./base.cr"

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

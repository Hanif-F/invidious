module Invidious::Database::SavedPlaylists
  extend self

  def exists?(email : String, id : String) : Bool
    PG_DB.query_one?("SELECT true FROM saved_playlists WHERE email = $1 AND source_id = $2", email, id, as: Bool) || false
  end

  def seed(email : String, id : String) : String?
    PG_DB.query_one?("SELECT seed_video_id FROM saved_playlists WHERE email = $1 AND source_id = $2", email, id, as: String?)
  end

  def list(email : String) : Array(JSON::Any)
    PG_DB.query_all("SELECT metadata, seed_video_id FROM saved_playlists WHERE email = $1 ORDER BY saved_at, source_id", email, as: {String, String?}).map do |raw, seed|
      fields = JSON.parse(raw).as_h
      fields["isOwned"] = JSON::Any.new(false)
      fields["isSaved"] = JSON::Any.new(true)
      fields["seedVideoId"] = JSON::Any.new(seed) if seed
      JSON::Any.new(fields)
    end
  end

  def save(email : String, fields : Hash(String, JSON::Any))
    id = fields["playlistId"].as_s
    seed = fields["seedVideoId"]?.try &.as_s?
    PG_DB.exec(<<-SQL, email, id, fields.to_json, seed)
      INSERT INTO saved_playlists (email, source_id, metadata, seed_video_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email, source_id) DO UPDATE SET metadata = EXCLUDED.metadata,
        seed_video_id = coalesce(EXCLUDED.seed_video_id, saved_playlists.seed_video_id)
    SQL
  end

  def refresh(email : String, fields : Hash(String, JSON::Any))
    PG_DB.exec("UPDATE saved_playlists SET metadata = $3 WHERE email = $1 AND source_id = $2", email, fields["playlistId"].as_s, fields.to_json)
  end

  def delete(email : String, id : String)
    PG_DB.transaction do |tx|
      conn = tx.connection
      conn.exec("DELETE FROM saved_playlists WHERE email = $1 AND source_id = $2", email, id)
      # Never remove an owned IV playlist or another account's legacy row.
      if !id.starts_with?("IV")
        conn.exec("DELETE FROM playlist_videos WHERE plid IN (SELECT id FROM playlists WHERE id = $1 AND author = $2)", id, email)
        conn.exec("DELETE FROM playlists WHERE id = $1 AND author = $2", id, email)
      end
    end
  end
end

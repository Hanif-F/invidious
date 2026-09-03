require "./base.cr"

module Invidious::Database::PlaybackPositions
  extend self

  MAX_POSITIONS_PER_USER = 1000
  RETENTION_PERIOD       = 365.days

  alias Entry = NamedTuple(video_id: String, position_seconds: Int32, updated_at: Time)

  def select(email : String, video_id : String) : Entry?
    request = <<-SQL
      SELECT video_id, position_seconds, updated_at
      FROM playback_positions
      WHERE email = $1 AND video_id = $2 AND updated_at >= $3
    SQL

    PG_DB.query_one?(
      request,
      email,
      video_id,
      Time.utc - RETENTION_PERIOD,
      as: {video_id: String, position_seconds: Int32, updated_at: Time}
    )
  end

  def select_all(email : String) : Array(Entry)
    request = <<-SQL
      SELECT video_id, position_seconds, updated_at
      FROM playback_positions
      WHERE email = $1 AND updated_at >= $2
      ORDER BY updated_at DESC
      LIMIT $3
    SQL

    PG_DB.query_all(
      request,
      email,
      Time.utc - RETENTION_PERIOD,
      MAX_POSITIONS_PER_USER,
      as: {video_id: String, position_seconds: Int32, updated_at: Time}
    )
  end

  def upsert(email : String, video_id : String, position_seconds : Int32, updated_at : Time = Time.utc)
    request = <<-SQL
      INSERT INTO playback_positions (email, video_id, position_seconds, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email, video_id) DO UPDATE
      SET position_seconds = EXCLUDED.position_seconds,
          updated_at = EXCLUDED.updated_at
      WHERE playback_positions.updated_at <= EXCLUDED.updated_at
    SQL

    PG_DB.exec(request, email, video_id, position_seconds, updated_at)
    prune(email)
  end

  def delete(email : String, video_id : String)
    PG_DB.exec("DELETE FROM playback_positions WHERE email = $1 AND video_id = $2", email, video_id)
  end

  def clear(email : String)
    PG_DB.exec("DELETE FROM playback_positions WHERE email = $1", email)
  end

  def delete_expired
    PG_DB.exec("DELETE FROM playback_positions WHERE updated_at < $1", Time.utc - RETENTION_PERIOD)
  end

  private def prune(email : String)
    request = <<-SQL
      DELETE FROM playback_positions
      WHERE email = $1 AND video_id IN (
        SELECT video_id
        FROM playback_positions
        WHERE email = $1
        ORDER BY updated_at DESC
        OFFSET $2
      )
    SQL

    PG_DB.exec(request, email, MAX_POSITIONS_PER_USER)
  end
end

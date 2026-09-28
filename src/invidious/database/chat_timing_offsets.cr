require "./base.cr"

module Invidious::Database::ChatTimingOffsets
  extend self

  def select(email : String, video_id : String) : Int32
    PG_DB.query_one?("SELECT offset_ms FROM chat_timing_offsets WHERE email = $1 AND video_id = $2",
      email, video_id, as: Int32) || 0
  end

  def select_all(email : String)
    PG_DB.query_all("SELECT video_id, offset_ms FROM chat_timing_offsets WHERE email = $1 ORDER BY updated_at DESC",
      email, as: {String, Int32})
  end

  def upsert(email : String, video_id : String, offset_ms : Int32)
    if offset_ms == 0
      PG_DB.exec("DELETE FROM chat_timing_offsets WHERE email = $1 AND video_id = $2", email, video_id)
    else
      PG_DB.exec("INSERT INTO chat_timing_offsets (email, video_id, offset_ms) VALUES ($1, $2, $3) ON CONFLICT (email, video_id) DO UPDATE SET offset_ms = EXCLUDED.offset_ms, updated_at = EXCLUDED.updated_at",
        email, video_id, offset_ms)
    end
  end
end

require "./base"

module Invidious::Database::Clips
  extend self

  SELECT = "SELECT c.*, u.username AS creator FROM clips c JOIN users u ON u.email = c.owner"

  def select(id : String) : InvidiousClip?
    return nil unless Invidious::Clips::Validation.valid_id?(id)
    PG_DB.query_one?("#{SELECT} WHERE c.id = $1", id, as: InvidiousClip)
  end

  def list(value : String, *, owned : Bool, page : Int32 = 1, extra : Bool = false) : Array(InvidiousClip)
    column = owned ? "owner" : "ucid"
    PG_DB.query_all("#{SELECT} WHERE c.#{column} = $1 ORDER BY c.created_at DESC, c.id DESC LIMIT $2 OFFSET $3",
      value, Invidious::Clips::PAGE_SIZE + (extra ? 1 : 0), (page.to_i64 - 1) * Invidious::Clips::PAGE_SIZE, as: InvidiousClip)
  end

  def insert(clip : InvidiousClip)
    PG_DB.exec("INSERT INTO clips (id, owner, video_id, ucid, title, start_ms, end_ms, created_at, video_title, channel_name, video_duration) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      clip.id, clip.owner, clip.video_id, clip.ucid, clip.title, clip.start_ms, clip.end_ms,
      clip.created_at, clip.video_title, clip.channel_name, clip.video_duration)
  end

  def delete(id : String, owner : String) : Bool
    PG_DB.exec("DELETE FROM clips WHERE id = $1 AND owner = $2", id, owner).rows_affected > 0
  end
end

require "./base"
require "../original_titles"

module Invidious::Database::OriginalVideoTitles
  extend self

  def select(ids : Array(String)) : Hash(String, OriginalTitles::Entry)
    entries = {} of String => OriginalTitles::Entry
    return entries if ids.empty?
    PG_DB.query_all("SELECT video_id, title, expires_at FROM original_video_titles WHERE video_id = ANY($1) AND expires_at > now()",
      ids, as: {String, String?, Time}).each do |id, title, expires_at|
      entries[id] = OriginalTitles::Entry.new(title, expires_at)
    end
    entries
  end

  def save(id : String, entry : OriginalTitles::Entry) : Nil
    PG_DB.exec(<<-SQL, id, entry.title, entry.expires_at)
      INSERT INTO original_video_titles (video_id, title, expires_at) VALUES ($1, $2, $3)
      ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, expires_at = EXCLUDED.expires_at
      WHERE original_video_titles.expires_at < EXCLUDED.expires_at
      SQL
  end

  def delete_expired
    PG_DB.exec("DELETE FROM original_video_titles WHERE expires_at <= now()")
  end
end

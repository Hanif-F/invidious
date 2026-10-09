require "../ai_slist"

class Invidious::Database::AiSListStorage < Invidious::AiSList::Storage
  def load_lists : Hash(String, Tuple(String, Time))
    PG_DB.query_all("SELECT kind, body, updated_at FROM ai_slist_snapshots", as: {String, String, Time})
      .to_h { |kind, body, updated_at| {kind, {body, updated_at}} }
  end

  def save_list(kind : String, body : String, updated_at : Time) : Nil
    PG_DB.exec(<<-SQL, kind, body, updated_at)
      INSERT INTO ai_slist_snapshots (kind, body, updated_at) VALUES ($1, $2, $3)
      ON CONFLICT (kind) DO UPDATE SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at
    SQL
  end

  def load_handles(ids : Array(String)) : Hash(String, Invidious::AiSList::HandleEntry)
    return {} of String => Invidious::AiSList::HandleEntry if ids.empty?
    PG_DB.query_all("SELECT ucid, handle, checked_at, expires_at FROM channel_handles WHERE ucid = ANY($1)", ids,
      as: {String, String?, Time, Time}).to_h do |id, handle, checked_at, expires_at|
      {id, Invidious::AiSList::HandleEntry.new(handle, checked_at, expires_at)}
    end
  end

  def save_handles(entries : Hash(String, Invidious::AiSList::HandleEntry)) : Nil
    return if entries.empty?
    values = [] of DB::Any
    rows = [] of String
    entries.each do |id, entry|
      offset = values.size
      rows << "($#{offset + 1}, $#{offset + 2}, $#{offset + 3}, $#{offset + 4})"
      values.concat([id, entry.handle, entry.checked_at, entry.expires_at])
    end
    PG_DB.exec(<<-SQL, args: values)
      INSERT INTO channel_handles (ucid, handle, checked_at, expires_at) VALUES #{rows.join(',')}
      ON CONFLICT (ucid) DO UPDATE SET handle = EXCLUDED.handle,
        checked_at = EXCLUDED.checked_at, expires_at = EXCLUDED.expires_at
      WHERE channel_handles.checked_at <= EXCLUDED.checked_at
    SQL
  end
end

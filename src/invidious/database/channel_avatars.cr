require "./base"
require "../helpers/channel_avatars"

module Invidious::Database::ChannelAvatars
  extend self

  def select(ids : Array(String)) : Hash(String, String)
    return {} of String => String if ids.empty?

    placeholders = (1..ids.size).map { |i| "$#{i}" }.join(',')
    PG_DB.query_all("SELECT ucid, url FROM channel_avatars WHERE ucid IN (#{placeholders})", args: ids, as: {String, String}).to_h
  rescue
    # This optional cache must never fail a page or fall through to an upstream fetch.
    # Driver SQL exceptions do not all inherit from DB::Error.
    {} of String => String
  end

  def observe(avatars : Hash(String, String), observed_at : Time = Time.utc) : Bool
    values = [] of DB::Any
    rows = [] of String
    avatars.each do |id, url|
      next if id.blank?
      next unless proxy_url = Invidious::ChannelAvatars.proxy_url(url)
      offset = values.size
      rows << "($#{offset + 1}, $#{offset + 2}, $#{offset + 3})"
      values.concat([id, proxy_url, observed_at])
    end
    return true if rows.empty?

    PG_DB.exec(<<-SQL, args: values)
      INSERT INTO channel_avatars (ucid, url, observed_at)
      VALUES #{rows.join(',')}
      ON CONFLICT (ucid) DO UPDATE
      SET url = EXCLUDED.url, observed_at = EXCLUDED.observed_at
      WHERE channel_avatars.observed_at < EXCLUDED.observed_at
    SQL
    true
  rescue
    false
  end
end

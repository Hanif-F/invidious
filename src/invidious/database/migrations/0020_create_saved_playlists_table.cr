module Invidious::Database::Migrations
  class CreateSavedPlaylistsTable < Migration
    version 20

    def up(conn : DB::Connection)
      conn.as(PG::Connection).exec_all(File.read("config/sql/saved_playlists.sql"))
      # Legacy external rows remain available to older clients and rollback.
      conn.exec <<-SQL
        INSERT INTO saved_playlists (email, source_id, metadata, seed_video_id, saved_at)
        SELECT p.author, p.id,
          json_build_object('type', 'playlist', 'playlistId', p.id,
            'title', coalesce(p.title, ''), 'videoCount', coalesce(p.video_count, 0),
            'privacy', 'public', 'isOwned', false, 'isSaved', true,
            'isMix', p.id LIKE 'RD%', 'description', '', 'author', '', 'authorId', '')::text,
          CASE WHEN p.id ~ '^RD[A-Za-z0-9_-]{11}$' THEN substring(p.id from 3) END,
          coalesce(p.created, now())
        FROM playlists p JOIN users u ON u.email = p.author
        WHERE p.id NOT LIKE 'IV%'
        ON CONFLICT (email, source_id) DO NOTHING
      SQL
    end
  end
end

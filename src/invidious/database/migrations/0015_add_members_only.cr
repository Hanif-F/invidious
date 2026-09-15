module Invidious::Database::Migrations
  class AddMembersOnly < Migration
    version 15

    def up(conn : DB::Connection)
      conn.exec "ALTER TABLE channel_videos ADD COLUMN IF NOT EXISTS members_only boolean NOT NULL DEFAULT false"
      conn.exec "ALTER TABLE playlist_videos ADD COLUMN IF NOT EXISTS members_only boolean NOT NULL DEFAULT false"
      # The existing refresh job rebuilds subscription views whose columns changed.
      conn.exec "UPDATE users SET feed_needs_update = true"
    end
  end
end

module Invidious::Database::Migrations
  class CreatePlaybackPositionsTable < Migration
    version 11

    def up(conn : DB::Connection)
      conn.exec <<-SQL
      CREATE TABLE IF NOT EXISTS public.playback_positions
      (
        email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
        video_id text NOT NULL,
        position_seconds integer NOT NULL CHECK (position_seconds >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (email, video_id)
      );
      SQL

      conn.exec <<-SQL
      CREATE INDEX IF NOT EXISTS playback_positions_email_updated_idx
        ON public.playback_positions (email, updated_at DESC);
      SQL

      conn.exec <<-SQL
      GRANT ALL ON TABLE public.playback_positions TO current_user;
      SQL
    end
  end
end

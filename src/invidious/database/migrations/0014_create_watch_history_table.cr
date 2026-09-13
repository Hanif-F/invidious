module Invidious::Database::Migrations
  class CreateWatchHistoryTable < Migration
    version 14

    def up(conn : DB::Connection)
      conn.exec <<-SQL
      CREATE TABLE IF NOT EXISTS public.watch_history
      (
        email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
        video_id text NOT NULL,
        title text,
        channel_name text,
        channel_id text,
        release_date date,
        latest_watched date,
        archived_dates date[] NOT NULL DEFAULT '{}',
        PRIMARY KEY (email, video_id)
      );
      SQL
    end
  end
end

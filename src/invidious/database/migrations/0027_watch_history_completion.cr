module Invidious::Database::Migrations
  class WatchHistoryCompletion < Migration
    version 27

    def up(conn : DB::Connection)
      conn.exec("ALTER TABLE public.watch_history ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false")
    end
  end
end

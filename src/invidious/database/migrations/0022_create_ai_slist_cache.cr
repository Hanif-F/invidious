module Invidious::Database::Migrations
  class CreateAiSListCache < Migration
    version 22

    def up(conn : DB::Connection)
      conn.as(PG::Connection).exec_all(File.read("config/sql/ai_slist_snapshots.sql"))
      conn.as(PG::Connection).exec_all(File.read("config/sql/channel_handles.sql"))
    end
  end
end

module Invidious::Database::Migrations
  class CreateClipsTable < Migration
    version 19

    def up(conn : DB::Connection)
      # Share the complete schema with fresh installations, including constraints.
      conn.as(PG::Connection).exec_all(File.read("config/sql/clips.sql"))
    end
  end
end

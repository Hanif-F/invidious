module Invidious::Database::Migrations
  class CreateOriginalVideoTitles < Migration
    version 24

    def up(conn : DB::Connection)
      conn.as(PG::Connection).exec_all(File.read("config/sql/original_video_titles.sql"))
    end
  end
end

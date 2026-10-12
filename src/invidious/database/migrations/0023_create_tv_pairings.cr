module Invidious::Database::Migrations
  class CreateTvPairings < Migration
    version 23

    def up(conn : DB::Connection)
      conn.as(PG::Connection).exec_all(File.read("config/sql/tv_pairings.sql"))
    end
  end
end

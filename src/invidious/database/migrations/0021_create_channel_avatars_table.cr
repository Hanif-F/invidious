module Invidious::Database::Migrations
  class CreateChannelAvatarsTable < Migration
    version 21

    def up(conn : DB::Connection)
      conn.as(PG::Connection).exec_all(File.read("config/sql/channel_avatars.sql"))
    end
  end
end

module Invidious::Database::Migrations
  class BotProtection < Migration
    version 25

    def up(conn : DB::Connection)
      conn.as(PG::Connection).exec_all(File.read("config/sql/bot_protection_settings.sql"))
    end
  end
end

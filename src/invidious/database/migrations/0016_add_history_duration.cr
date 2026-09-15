module Invidious::Database::Migrations
  class AddHistoryDuration < Migration
    version 16

    def up(conn : DB::Connection)
      conn.exec <<-SQL
      ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS length_seconds integer CHECK (length_seconds > 0);
      SQL
    end
  end
end

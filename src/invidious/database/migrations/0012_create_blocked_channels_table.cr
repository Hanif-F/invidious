module Invidious::Database::Migrations
  class CreateBlockedChannelsTable < Migration
    version 12

    def up(conn : DB::Connection)
      conn.exec <<-SQL
      CREATE TABLE IF NOT EXISTS public.blocked_channels
      (
        email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
        ucid text NOT NULL,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (email, ucid)
      );
      SQL
      conn.exec("GRANT ALL ON TABLE public.blocked_channels TO current_user")
    end
  end
end

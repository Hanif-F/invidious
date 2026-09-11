module Invidious::Database::Migrations
  class CreateDeArrowIdentitiesTable < Migration
    version 13

    def up(conn : DB::Connection)
      conn.exec <<-SQL
      CREATE TABLE IF NOT EXISTS public.dearrow_identities
      (
        email text PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
        ciphertext text NOT NULL
      );
      SQL
      conn.exec("GRANT ALL ON TABLE public.dearrow_identities TO current_user")
    end
  end
end

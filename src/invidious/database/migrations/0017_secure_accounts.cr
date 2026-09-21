module Invidious::Database::Migrations
  class SecureAccounts < Migration
    version 17

    def up(conn : DB::Connection)
      conn.exec "LOCK TABLE users, session_ids IN ACCESS EXCLUSIVE MODE"
      conn.exec "ALTER TABLE users ADD COLUMN IF NOT EXISTS username text"
      conn.exec "ALTER TABLE users ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 1"
      conn.exec "UPDATE users SET username = email WHERE username IS NULL"
      if conn.query_one("SELECT EXISTS (SELECT lower(username) FROM users GROUP BY lower(username) HAVING count(*) > 1)", as: Bool)
        raise "Account migration aborted: case-insensitive username conflicts. Restore/check the backup and resolve conflicts explicitly; no accounts were changed."
      end
      conn.exec "ALTER TABLE users ALTER COLUMN username SET NOT NULL"
      conn.exec "CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (lower(username))"
      conn.exec "ALTER TABLE session_ids ADD COLUMN IF NOT EXISTS expires_at timestamptz"
      conn.exec "UPDATE session_ids SET expires_at = now() + interval '30 days' WHERE expires_at IS NULL AND id NOT LIKE 'v1:%'"
      conn.exec <<-SQL
        CREATE TABLE IF NOT EXISTS auth_rate_limits (
          key text PRIMARY KEY,
          attempts integer NOT NULL,
          expires_at timestamptz NOT NULL
        )
      SQL
      conn.exec "CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON auth_rate_limits (expires_at)"
    end
  end
end

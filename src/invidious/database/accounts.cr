module Invidious::Database::Accounts
  extend self

  def check_schema
    columns = PG_DB.query_all("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'", as: String)
    unless columns.includes?("username") && columns.includes?("credential_version")
      raise "Account schema needs migration. Back up the database, stop all instances, and run --migrate."
    end
  end

  def authenticate(username : String, password : String) : String?
    sid = nil
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = conn.query_one?("SELECT * FROM users WHERE lower(username) = lower($1) FOR UPDATE", username, as: User)
      if user && Credentials.verify(user.password, user.credential_version, password)
        sid = Base64.urlsafe_encode(Random::Secure.random_bytes(32))
        SessionIDs.insert(sid.not_nil!, user.email, conn: conn)
      else
        Credentials.dummy_verify unless user
      end
    end
    sid
  end

  def register(username : String, password : String, preferences : Preferences) : String
    sid = Base64.urlsafe_encode(Random::Secure.random_bytes(32))
    user, _ = create_user(sid, "account:#{Random::Secure.hex(32)}", password)
    user.username = username
    user.preferences = preferences
    PG_DB.transaction do |tx|
      conn = tx.connection
      Users.insert(user, conn: conn)
      conn.exec("CREATE MATERIALIZED VIEW subscriptions_#{sha256(user.email)} AS #{MATERIALIZED_VIEW_SQL.call(user.email)}")
      SessionIDs.insert(sid, user.email, conn: conn)
    end
    sid
  end

  def change(email : String, current_sid : String, password : String, username : String? = nil, new_password : String? = nil) : String?
    new_hash = new_password.try { |value| Credentials.hash(value) }
    sid = nil
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = conn.query_one?("SELECT * FROM users WHERE email = $1 FOR UPDATE", email, as: User)
      active = conn.query_one?("SELECT true FROM session_ids WHERE id = $1 AND email = $2 AND expires_at > now()", current_sid, email, as: Bool)
      if user && active && Credentials.verify(user.password, user.credential_version, password)
        if username
          conn.exec("UPDATE users SET username = $1 WHERE email = $2", username, email)
        end
        if new_hash
          conn.exec("UPDATE users SET password = $1, credential_version = 2 WHERE email = $2", new_hash, email)
        end
        conn.exec("DELETE FROM session_ids WHERE email = $1", email)
        sid = Base64.urlsafe_encode(Random::Secure.random_bytes(32))
        SessionIDs.insert(sid.not_nil!, email, conn: conn)
      end
    end
    sid
  end

  def delete(email : String, sid : String, password : String) : Bool
    deleted = false
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = conn.query_one?("SELECT * FROM users WHERE email = $1 FOR UPDATE", email, as: User)
      active = conn.query_one?("SELECT true FROM session_ids WHERE id = $1 AND email = $2 AND expires_at > now()", sid, email, as: Bool)
      if user && active && Credentials.verify(user.password, user.credential_version, password)
        conn.exec("DELETE FROM session_ids WHERE email = $1", email)
        conn.exec("DROP MATERIALIZED VIEW IF EXISTS subscriptions_#{sha256(email)}")
        conn.exec("DELETE FROM playlist_videos WHERE plid IN (SELECT id FROM playlists WHERE author = $1)", email)
        conn.exec("DELETE FROM playlists WHERE author = $1", email)
        conn.exec("DELETE FROM users WHERE email = $1", email)
        deleted = true
      end
    end
    deleted
  end

  # Fixed windows are persisted and updated atomically across all instances.
  def throttle(key : String, limit : Int32, seconds : Int32) : Int32?
    digest = OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, key)
    PG_DB.exec("DELETE FROM auth_rate_limits WHERE expires_at <= now()")
    attempts, expires = PG_DB.query_one(<<-SQL, digest, seconds, as: {Int32, Time})
      INSERT INTO auth_rate_limits (key, attempts, expires_at)
      VALUES ($1, 1, now() + $2 * interval '1 second')
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limits.expires_at <= now() THEN 1 ELSE auth_rate_limits.attempts + 1 END,
        expires_at = CASE WHEN auth_rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END
      RETURNING attempts, expires_at
    SQL
    attempts > limit ? {(expires - Time.utc).total_seconds.ceil.to_i, 1}.max : nil
  end
end

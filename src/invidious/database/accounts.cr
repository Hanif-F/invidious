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
    user.preferences = preferences if preferences
    PG_DB.transaction do |tx|
      conn = tx.connection
      Users.insert(user, conn: conn)
      conn.exec("CREATE MATERIALIZED VIEW subscriptions_#{sha256(user.email)} AS #{MATERIALIZED_VIEW_SQL.call(user.email)}")
      SessionIDs.insert(sid, user.email, conn: conn)
    end
    sid
  end

  # Verification and issuance share the same account lock as credential changes.
  # A concurrent password change therefore cannot leave a newly issued token alive.
  def authenticate_mobile(username : String, password : String) : NamedTuple(accessToken: String, username: String, expiresAt: Int64)?
    result = nil
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = conn.query_one?("SELECT * FROM users WHERE lower(username) = lower($1) FOR UPDATE", username, as: User)
      if user && Credentials.verify(user.password, user.credential_version, password)
        result = issue_mobile(user, conn)
      else
        Credentials.dummy_verify unless user
      end
    end
    result
  end

  def change(email : String, current_sid : String, password : String, username : String? = nil, new_password : String? = nil) : String?
    new_hash = new_password.try { |value| Credentials.hash(value) }
    sid = nil
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = conn.query_one?("SELECT * FROM users WHERE email = $1 FOR UPDATE", email, as: User)
      active = conn.query_one?("SELECT true FROM session_ids WHERE id = $1 AND email = $2 AND (expires_at > now() OR (expires_at IS NULL AND id LIKE 'v1:%'))", current_sid, email, as: Bool)
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

  def delete(email : String, sid : String, password : String, strict : Bool = false) : Bool
    deleted = false
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = conn.query_one?("SELECT * FROM users WHERE email = $1 FOR UPDATE", email, as: User)
      active = conn.query_one?("SELECT true FROM session_ids WHERE id = $1 AND email = $2 AND (expires_at > now() OR (expires_at IS NULL AND id LIKE 'v1:%'))", sid, email, as: Bool)
      if strict
        raise SessionError.new("Your session expired. Sign in again.") unless user && active
        verify_password(user, password)
      end
      if user && active && (strict || Credentials.verify(user.password, user.credential_version, password))
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

  class PasswordError < Exception
  end

  class SessionError < Exception
  end

  def active_account(email : String, sid : String, conn) : User
    user = conn.query_one?("SELECT * FROM users WHERE email = $1 FOR UPDATE", email, as: User)
    active = conn.query_one?("SELECT true FROM session_ids WHERE id = $1 AND email = $2 AND (expires_at > now() OR (expires_at IS NULL AND id LIKE 'v1:%'))", sid, email, as: Bool)
    raise SessionError.new("Your session expired. Sign in again.") unless user && active
    user
  end

  def verify_password(user : User, password : String)
    raise PasswordError.new("Incorrect current password.") unless Credentials.verify(user.password, user.credential_version, password)
  end

  def issue_mobile(user : User, conn) : NamedTuple(accessToken: String, username: String, expiresAt: Int64)
    expires = Time.utc + 30.days
    token = issue_account_token(user.email, Invidious::Routes::API::V1::Mobile::SCOPES, expires, conn)
    {accessToken: token, username: user.username, expiresAt: expires.to_unix}
  end

  def issue_account_token(email : String, scopes : Array(String), expires : Time?, conn) : String
    session = "v1:#{Base64.urlsafe_encode(Random::Secure.random_bytes(32))}"
    conn.exec("INSERT INTO session_ids (id, email, issued, expires_at) VALUES ($1, $2, now(), $3)", session, email, expires)
    token = {"session" => JSON::Any.new(session), "scopes" => JSON::Any.new(scopes.map { |scope| JSON::Any.new(scope) })}
    token["expire"] = JSON::Any.new(expires.to_unix) if expires
    token["signature"] = JSON::Any.new(sign_token(HMAC_KEY, token))
    token.to_json
  end

  def register_mobile(username : String, password : String, preferences : Preferences? = nil)
    user, _ = create_user("", "account:#{Random::Secure.hex(32)}", password)
    user.username = username
    user.preferences = preferences if preferences
    PG_DB.transaction do |tx|
      conn = tx.connection
      Users.insert(user, conn: conn)
      conn.exec("CREATE MATERIALIZED VIEW subscriptions_#{sha256(user.email)} AS #{MATERIALIZED_VIEW_SQL.call(user.email)}")
      issue_mobile(user, conn)
    end.not_nil!
  end

  def change_mobile(email : String, sid : String, password : String, username : String? = nil, new_password : String? = nil)
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = active_account(email, sid, conn)
      verify_password(user, password)
      if username
        conn.exec("UPDATE users SET username = $1 WHERE email = $2", username, email)
        user.username = username
      end
      if new_password
        conn.exec("UPDATE users SET password = $1, credential_version = 2 WHERE email = $2", Credentials.hash(new_password), email)
      end
      conn.exec("DELETE FROM session_ids WHERE email = $1", email)
      issue_mobile(user, conn)
    end.not_nil!
  end

  def management_id(email : String, sid : String) : String
    OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, "account-session:#{email}:#{sid}")
  end

  def managed_sessions(email : String, sid : String)
    PG_DB.transaction do |tx|
      conn = tx.connection
      active_account(email, sid, conn)
      conn.query_all("SELECT id, issued, expires_at FROM session_ids WHERE email = $1 ORDER BY issued DESC, id", email, as: {String, Time, Time?}).map do |id, issued, expires|
        {id: management_id(email, id), type: id.starts_with?("v1:") ? "api" : "browser",
         issuedAt: issued.to_unix, expiresAt: expires.try(&.to_unix), current: id == sid}
      end
    end.not_nil!
  end

  def revoke_managed(email : String, sid : String, id : String) : Bool
    PG_DB.transaction do |tx|
      conn = tx.connection
      active_account(email, sid, conn)
      target = conn.query_all("SELECT id FROM session_ids WHERE email = $1", email, as: String).find { |value| Crypto::Subtle.constant_time_compare(management_id(email, value), id) }
      if target
        conn.exec("DELETE FROM session_ids WHERE id = $1 AND email = $2", target, email)
      end
      !target.nil?
    end.not_nil!
  end

  def authorize_mobile_token(email : String, sid : String, password : String, scopes : Array(String), expires : Time?)
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = active_account(email, sid, conn)
      verify_password(user, password)
      issue_account_token(email, scopes, expires, conn)
    end.not_nil!
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

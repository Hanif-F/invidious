module Invidious::Database::TvPairings
  extend self

  ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  LIFETIME = 600
  INTERVAL =   5
  alias Credentials = NamedTuple(accessToken: String, username: String, expiresAt: Int64, profileId: String)

  struct Grant
    include DB::Serializable
    getter device_hash : String
    getter user_hash : String
    getter created_at : Time
    getter expires_at : Time
    getter state : String
    getter account_email : String?
    getter approving_session : String?
    getter poll_after : Time
    getter poll_interval : Int32
  end

  def digest(kind : String, value : String) : String
    OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, "tv-pairing:#{kind}:#{value}")
  end

  def normalize(raw : String) : String?
    return nil if raw.bytesize > 32
    code = raw.upcase.delete('-').strip
    code.size == 8 && code.each_char.all? { |char| ALPHABET.includes?(char) } ? code : nil
  end

  def display(code : String) : String
    "#{code[0, 4]}-#{code[4, 4]}"
  end

  def start
    now = Time.utc
    10.times do
      device = Base64.urlsafe_encode(Random::Secure.random_bytes(32), padding: false)
      code = String.build { |io| 8.times { io << ALPHABET[Random::Secure.rand(ALPHABET.size)] } }
      inserted = PG_DB.exec(<<-SQL, digest("device", device), digest("user", code), now, now + LIFETIME.seconds, now + INTERVAL.seconds)
        INSERT INTO tv_pairings (device_hash, user_hash, created_at, expires_at, poll_after)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
      SQL
      return {deviceCode: device, userCode: display(code), expiresIn: LIFETIME, pollInterval: INTERVAL} if inserted.rows_affected == 1
    end
    raise "Could not allocate a TV pairing grant"
  end

  # Issuance and consumption share a transaction. Account changes take the same
  # first lock; browser session deletion serializes on the last lock.
  def poll(device : String) : Credentials | String
    hash = digest("device", device)
    owner = PG_DB.query_one?("SELECT account_email FROM tv_pairings WHERE device_hash = $1", hash, as: String?)
    PG_DB.transaction do |tx|
      conn = tx.connection
      user = owner ? conn.query_one?("SELECT * FROM users WHERE email = $1 FOR UPDATE", owner, as: User) : nil
      grant = conn.query_one?("SELECT * FROM tv_pairings WHERE device_hash = $1 FOR UPDATE", hash, as: Grant)
      next "invalid_grant" unless grant
      now = Time.utc
      if grant.expires_at <= now
        conn.exec("UPDATE tv_pairings SET state = 'expired' WHERE device_hash = $1", hash)
        next "expired_token"
      end
      next "invalid_grant" if grant.state == "consumed"
      next "access_denied" if grant.state == "denied"
      if grant.poll_after > now
        interval = grant.poll_interval + 5
        conn.exec("UPDATE tv_pairings SET poll_interval = $2, poll_after = $3 WHERE device_hash = $1", hash, interval, now + interval.seconds)
        next "slow_down"
      end
      conn.exec("UPDATE tv_pairings SET poll_after = $2 WHERE device_hash = $1", hash, now + grant.poll_interval.seconds)
      next "authorization_pending" if grant.state == "pending"
      # If approval won after the owner lookup, wait for a poll which holds the
      # actual approving account's lock rather than issuing without it.
      next "authorization_pending" if owner.nil? && grant.account_email
      active = grant.approving_session.try do |sid|
        conn.query_one?("SELECT true FROM session_ids WHERE id = $1 AND email = $2 AND expires_at > clock_timestamp() AND id NOT LIKE 'v1:%' FOR KEY SHARE", sid, grant.account_email, as: Bool)
      end
      unless user && user.email == grant.account_email && active
        conn.exec("UPDATE tv_pairings SET state = 'denied' WHERE device_hash = $1", hash)
        next "access_denied"
      end
      credentials = Accounts.issue_mobile(user, conn)
      conn.exec("UPDATE tv_pairings SET state = 'consumed' WHERE device_hash = $1", hash)
      credentials
    end.not_nil!
  end

  def decide(code : String, email : String, sid : String, approve : Bool) : Bool
    return false if sid.starts_with?("v1:")
    PG_DB.transaction do |tx|
      conn = tx.connection
      Accounts.active_account(email, sid, conn)
      hash = digest("user", code)
      grant = conn.query_one?("SELECT * FROM tv_pairings WHERE user_hash = $1 FOR UPDATE", hash, as: Grant)
      next false unless grant
      if grant.expires_at <= Time.utc
        conn.exec("UPDATE tv_pairings SET state = 'expired' WHERE user_hash = $1", hash)
        next false
      end
      next false unless grant.state == "pending"
      active = conn.query_one?("SELECT true FROM session_ids WHERE id = $1 AND email = $2 AND expires_at > clock_timestamp() FOR KEY SHARE", sid, email, as: Bool)
      next false unless active
      conn.exec("UPDATE tv_pairings SET state = $2, account_email = $3, approving_session = $4 WHERE user_hash = $1", hash, approve ? "approved" : "denied", email, sid)
      true
    end.not_nil!
  end

  def delete_expired
    PG_DB.exec("DELETE FROM tv_pairings WHERE expires_at <= now()")
  end
end

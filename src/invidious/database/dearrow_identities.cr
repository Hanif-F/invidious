module Invidious::Database::DeArrowIdentities
  extend self

  class StaleIdentity < Exception
  end

  # An account-bound opaque revision, never a private ID or its digest. The web
  # editor may compare ciphertext revisions without decrypting/sending identities.
  private def snapshot_for(email : String, ciphertext : String?, revision_key : String)
    {configured: !ciphertext.nil?, revision: OpenSSL::HMAC.hexdigest(:sha256, revision_key, "dearrow-editor:v1:#{email.bytesize}:#{email}:#{ciphertext || "missing"}")}
  end

  def snapshot(email : String, revision_key : String)
    snapshot_for(email, PG_DB.query_one?("SELECT ciphertext FROM dearrow_identities WHERE email = $1", email, as: String), revision_key)
  end

  # Preserve a native import or another web tab that won after the last read.
  # Neither the original ciphertext nor the private ID leaves this service.
  def import_if_current(email : String, id : String, key : String, revision : String, revision_key : String)
    raise ArgumentError.new("Invalid private user ID") unless DeArrow::IdentityCipher.valid_id?(id)
    before = PG_DB.query_one?("SELECT ciphertext FROM dearrow_identities WHERE email = $1", email, as: String)
    raise StaleIdentity.new unless snapshot_for(email, before, revision_key)[:revision] == revision
    value = DeArrow::IdentityCipher.seal(id, email, key)
    result = if before
               PG_DB.exec("UPDATE dearrow_identities SET ciphertext = $1 WHERE email = $2 AND ciphertext = $3", value, email, before)
             else
               PG_DB.exec("INSERT INTO dearrow_identities (email, ciphertext) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING", email, value)
             end
    raise StaleIdentity.new unless result.rows_affected == 1
    snapshot_for(email, value, revision_key)
  end

  def configured?(email : String) : Bool
    !!PG_DB.query_one?("SELECT email FROM dearrow_identities WHERE email = $1", email, as: String)
  end

  def identity(email : String, key : String) : String
    if value = PG_DB.query_one?("SELECT ciphertext FROM dearrow_identities WHERE email = $1", email, as: String)
      return DeArrow::IdentityCipher.open(value, email, key)
    end
    value = DeArrow::IdentityCipher.seal(Random::Secure.hex(32), email, key)
    PG_DB.exec("INSERT INTO dearrow_identities (email, ciphertext) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING", email, value)
    # Read the winner if two sessions created an identity concurrently.
    DeArrow::IdentityCipher.open(PG_DB.query_one("SELECT ciphertext FROM dearrow_identities WHERE email = $1", email, as: String), email, key)
  end

  def import(email : String, id : String, key : String)
    raise ArgumentError.new("Invalid private user ID") unless DeArrow::IdentityCipher.valid_id?(id)
    value = DeArrow::IdentityCipher.seal(id, email, key)
    PG_DB.exec("INSERT INTO dearrow_identities (email, ciphertext) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET ciphertext = EXCLUDED.ciphertext", email, value)
  end
end

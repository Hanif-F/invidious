module Invidious::Database::DeArrowIdentities
  extend self

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

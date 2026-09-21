require "crypto/bcrypt/password"
require "set"

module Invidious::Credentials
  extend self

  COMMON_PASSWORDS = {{ read_file("config/security/common-passwords.txt") }}.lines.map(&.strip.downcase).to_set
  DUMMY_HASH       = Crypto::Bcrypt::Password.create(Random::Secure.hex(32), cost: 12).to_s

  def username_error(username : String) : String?
    "Use 3–32 letters, numbers, underscores, dots, or hyphens." unless username.matches?(/\A[a-zA-Z0-9_.-]{3,32}\z/)
  end

  def password_error(password : String) : String?
    return "Use at least 15 characters and at most 72 UTF-8 bytes." if password.size < 15 || password.bytesize > 72 || password.includes?('\0')
    return "Choose a less common password." if COMMON_PASSWORDS.includes?(password.downcase) || password.chars.uniq.size < 4
    nil
  end

  def hash(password : String) : String
    # Crystal counts the trailing NUL in its 72-byte bcrypt input limit.
    # At exactly 72 bytes bcrypt consumes the entire input without that terminator.
    if password.bytesize == 72
      Crypto::Bcrypt.new(password.to_slice, Random::Secure.random_bytes(16), 12).to_s
    else
      Crypto::Bcrypt::Password.create(password, cost: 12).to_s
    end
  end

  def verify(hash : String?, version : Int32, password : String) : Bool
    unless hash && {1, 2}.includes?(version)
      dummy_verify
      return false
    end
    parsed = Crypto::Bcrypt::Password.new(hash)
    if version == 1
      parsed.verify(password.byte_slice(0, 55))
    elsif password.bytesize == 72
      computed = Crypto::Bcrypt.new(password.to_slice, Crypto::Bcrypt::Base64.decode(parsed.salt, 16), parsed.cost).to_s
      Crypto::Subtle.constant_time_compare(hash, computed)
    elsif password.bytesize.in?(1..71)
      parsed.verify(password)
    else
      dummy_verify
      false
    end
  rescue Crypto::Bcrypt::Error | ArgumentError | IndexError
    dummy_verify
    false
  end

  def dummy_verify
    Crypto::Bcrypt::Password.new(DUMMY_HASH).verify("invalid credentials")
  end
end

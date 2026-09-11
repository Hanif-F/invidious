require "openssl/cipher"
require "openssl/hmac"
require "crypto/subtle"
require "random/secure"
require "base64"

module Invidious::DeArrow
  # Encrypt-then-MAC, with separate derived keys and account-bound authentication.
  # Never reuse the CSRF key: this secret must survive application restarts.
  module IdentityCipher
    extend self

    def ready?(key : String) : Bool
      !!key.match(/\A[0-9a-fA-F]{64}\z/)
    end

    def valid_id?(id : String) : Bool
      !!id.match(/\A[A-Za-z0-9_-]{30,256}\z/)
    end

    def seal(id : String, email : String, key : String) : String
      raise ArgumentError.new("DeArrow encryption is not configured") unless ready?(key)
      cipher = OpenSSL::Cipher.new("aes-256-cbc")
      cipher.encrypt
      cipher.key = OpenSSL::HMAC.digest(:sha256, key, "dearrow/encryption/v1")
      iv = Random::Secure.random_bytes(16)
      cipher.iv = iv
      output = IO::Memory.new
      output.write(cipher.update(id))
      output.write(cipher.final)
      payload = "v1.#{Base64.strict_encode(iv)}.#{Base64.strict_encode(output.to_slice)}"
      "#{payload}.#{mac(payload, email, key)}"
    end

    def open(value : String, email : String, key : String) : String
      raise ArgumentError.new("DeArrow encryption is not configured") unless ready?(key)
      parts = value.split('.')
      raise ArgumentError.new("Invalid DeArrow identity") unless parts.size == 4 && parts[0] == "v1"
      payload = parts[0, 3].join('.')
      unless Crypto::Subtle.constant_time_compare(parts[3], mac(payload, email, key))
        raise ArgumentError.new("Invalid DeArrow identity")
      end
      cipher = OpenSSL::Cipher.new("aes-256-cbc")
      cipher.decrypt
      cipher.key = OpenSSL::HMAC.digest(:sha256, key, "dearrow/encryption/v1")
      cipher.iv = Base64.decode(parts[1])
      output = IO::Memory.new
      output.write(cipher.update(Base64.decode(parts[2])))
      output.write(cipher.final)
      output.to_s
    end

    private def mac(payload : String, email : String, key : String) : String
      signing_key = OpenSSL::HMAC.digest(:sha256, key, "dearrow/authentication/v1")
      Base64.strict_encode(OpenSSL::HMAC.digest(:sha256, signing_key, "#{email.bytesize}:#{email}:#{payload}"))
    end
  end
end

require "spectator"
require "../../../src/invidious/user/credentials"

Spectator.describe Invidious::Credentials do
  it "accepts only the new ASCII username policy" do
    expect(described_class.username_error("a.B-c_123")).to be_nil
    ["ab", "a" * 33, "a b", "éclair", "name\n"].each do |name|
      expect(described_class.username_error(name)).not_to be_nil
    end
  end

  it "validates characters, UTF-8 byte limits and common passwords" do
    expect(described_class.password_error("a memorable river phrase")).to be_nil
    expect(described_class.password_error("short secret")).not_to be_nil
    expect(described_class.password_error("é" * 37)).not_to be_nil
    expect(described_class.password_error("films+pic+galeries")).not_to be_nil
    expect(described_class.password_error("a" * 20)).not_to be_nil
  end

  it "keeps the legacy 55-byte verification behavior" do
    original = "legacy secret" * 5
    hash = Crypto::Bcrypt::Password.create(original.byte_slice(0, 55), cost: 4).to_s
    expect(described_class.verify(hash, 1, original)).to be_true
    expect(described_class.verify(hash, 1, original.byte_slice(0, 55) + "different suffix")).to be_true
    expect(described_class.verify(hash, 1, "wrong")).to be_false
  end

  it "uses full new passwords, including exactly 72 bytes" do
    ["a strong password with spaces", "éa" * 24].each do |password|
      hash = described_class.hash(password)
      expect(Crypto::Bcrypt::Password.new(hash).cost).to eq(12)
      expect(described_class.verify(hash, 2, password)).to be_true
      expect(described_class.verify(hash, 2, password.byte_slice(0, {password.bytesize - 1, 55}.min))).to be_false
      expect(described_class.verify(hash, 2, password + "x")).to be_false
    end
  end

  it "rejects missing and malformed credentials safely" do
    expect(described_class.verify(nil, 1, "password")).to be_false
    expect(described_class.verify("broken", 1, "password")).to be_false
    expect(described_class.verify(nil, 99, "")).to be_false
  end
end

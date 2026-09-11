require "spec"
require "../src/invidious/dearrow_contributions"
require "../src/invidious/dearrow_identity"

private DEARROW_KEY = "ab" * 32

describe Invidious::DeArrow::IdentityCipher do
  it "authenticates the ciphertext, account, and dedicated key with randomized encryption" do
    cipher = Invidious::DeArrow::IdentityCipher
    id = "c" * 64
    value = cipher.seal(id, "alice", DEARROW_KEY)
    value.should_not contain(id)
    cipher.open(value, "alice", DEARROW_KEY).should eq(id)
    cipher.seal(id, "alice", DEARROW_KEY).should_not eq(value)
    expect_raises(ArgumentError) { cipher.open(value, "bob", DEARROW_KEY) }
    expect_raises(ArgumentError) { cipher.open(value, "alice", "cd" * 32) }
    parts = value.split('.')
    parts[2] = Base64.strict_encode("tampered ciphertext")
    expect_raises(ArgumentError) { cipher.open(parts.join('.'), "alice", DEARROW_KEY) }
    expect_raises(ArgumentError) { cipher.seal(id, "alice", "") }
  end

  it "accepts private IDs without treating a display name as an identity" do
    cipher = Invidious::DeArrow::IdentityCipher
    cipher.valid_id?("ab" * 32).should be_true
    cipher.valid_id?("12345678-1234-1234-1234-123456789abc").should be_true
    {"", "public-name", "a" * 257, "a" * 32 + "\n"}.each { |id| cipher.valid_id?(id).should be_false }
  end
end

describe Invidious::DeArrow::Contributions do
  it "loads all ranks through the hash-prefix API without disclosing a private identity" do
    calls = [] of String
    transport = ->(method : String, path : String, body : String?) {
      calls << "#{method} #{path}"
      body.should be_nil
      HTTP::Client::Response.new(200, body: {"abcdefghijk" => {titles: [
        {title: "Original", original: true, votes: 4, locked: true, UUID: "first"},
        {title: "A >proposal", original: false, votes: -2, locked: false, UUID: "second"},
      ]}}.to_json)
    }
    result = Invidious::DeArrow::Contributions.new(transport).titles("abcdefghijk")
    result.map(&.uuid).should eq(["first", "second"])
    result[1].title.should eq("A >proposal")
    result[1].votes.should eq(-2)
    calls.should eq(["GET /api/branding/#{Digest::SHA256.hexdigest("abcdefghijk")[0, 4]}?fetchAll=true"])
  end

  it "sends exact titles and original markers with regular-user voting semantics" do
    transport = ->(method : String, path : String, body : String?) {
      method.should eq("POST")
      path.should eq("/api/branding")
      data = JSON.parse(body.not_nil!)
      data["title"]["title"].should eq("An >exact title")
      data["title"]["original"].should eq(true)
      data["downvote"].should eq(true)
      data["autoLock"].should eq(false)
      data["userAgent"].should eq("Invidious/test")
      data["userID"].should eq("private-id")
      data["thumbnail"]?.should be_nil
      HTTP::Client::Response.new(200)
    }
    Invidious::DeArrow::Contributions.new(transport).submit("abcdefghijk", "private-id", "An >exact title", true, true, "test")
  end

  it "handles missing titles and never leaks upstream bodies or retries writes" do
    calls = 0
    transport = ->(_method : String, _path : String, _body : String?) {
      calls += 1
      HTTP::Client::Response.new(429, body: "secret private identity")
    }
    error = expect_raises(Invidious::DeArrow::ContributionError) {
      Invidious::DeArrow::Contributions.new(transport).submit("abcdefghijk", "private-id", "Title", false, false, "test")
    }
    calls.should eq(1)
    error.status.should eq(429)
    error.message.to_s.should_not contain("secret")
    missing = ->(_method : String, _path : String, _body : String?) { HTTP::Client::Response.new(404) }
    Invidious::DeArrow::Contributions.new(missing).titles("abcdefghijk").should be_empty
  end
end

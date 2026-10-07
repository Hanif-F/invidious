require "spec"
require "json"
require "pg"
require "../src/invidious/helpers/tokens"
require "../src/invidious/routes/api/v1/mobile"

describe "Native clip scopes" do
  it "grants own-list reads, creation, and scoped deletion" do
    scopes = Invidious::Routes::API::V1::Mobile::SCOPES
    scopes_include_scope(scopes, "GET:clips").should be_true
    scopes_include_scope(scopes, "POST:clips").should be_true
    scopes_include_scope(scopes, "DELETE:clips/IVCL" + "a" * 32).should be_true
    scopes_include_scope(scopes, "PATCH:clips/IVCL" + "a" * 32).should be_false
    scopes_include_scope(scopes, "DELETE:clips").should be_false
  end

  it "requires renewed native tokens to add clip permissions" do
    old_scopes = %w(GET:preferences PATCH:preferences GET:playlists)
    scopes_include_scope(old_scopes, "GET:clips").should be_false
    scopes_include_scope(old_scopes, "POST:clips").should be_false
    scopes_include_scope(old_scopes, "DELETE:clips/IVCL" + "a" * 32).should be_false
  end
end

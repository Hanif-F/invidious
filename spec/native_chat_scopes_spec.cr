require "spec"
require "json"
require "pg"
require "../src/invidious/helpers/tokens"
require "../src/invidious/routes/api/v1/mobile"

describe "Native chat replay scopes" do
  it "grants native sign-in settings patches and per-video timing reads/writes" do
    scopes = Invidious::Routes::API::V1::Mobile::SCOPES
    scopes_include_scope(scopes, "PATCH:chat_preferences").should be_true
    scopes_include_scope(scopes, "GET:chat_timing/abcdefghijk").should be_true
    scopes_include_scope(scopes, "PUT:chat_timing/abcdefghijk").should be_true
    scopes_include_scope(scopes, "DELETE:chat_timing/abcdefghijk").should be_false
    scopes_include_scope(scopes, "POST:tokens/register").should be_false
  end

  it "keeps existing preference-only tokens restricted until sign-in is renewed" do
    old_scopes = %w(GET:preferences PATCH:preferences)
    scopes_include_scope(old_scopes, "PATCH:chat_preferences").should be_false
    scopes_include_scope(old_scopes, "GET:chat_timing/abcdefghijk").should be_false
    scopes_include_scope(old_scopes, "PUT:chat_timing/abcdefghijk").should be_false
  end
end

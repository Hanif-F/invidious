require "spectator"
require "http/server"
require "../../../src/invidious/frontend/search_preferences"

private def search_context(cookies = "")
  HTTP::Server::Context.new(HTTP::Request.new("GET", "/search", HTTP::Headers{"Cookie" => cookies}), HTTP::Server::Response.new(IO::Memory.new))
end

Spectator.describe Invidious::Frontend::SearchPreferences do
  it "uses the account default until a browser override exists" do
    expect(described_class.apply(search_context, HTTP::Params.new, false)).to be_false
    expect(described_class.apply(search_context, HTTP::Params.new, true)).to be_true
    expect(described_class.apply(search_context("SEARCH_SHOW_MEMBER_VIDEOS=0"), HTTP::Params.new, true)).to be_false
    expect(described_class.apply(search_context("SEARCH_SHOW_MEMBER_VIDEOS=1"), HTTP::Params.new, false)).to be_true
  end

  it "saves explicit checked and unchecked form choices in independent cookies" do
    env = search_context("SEARCH_SHOW_MEMBER_VIDEOS=1; SEARCH_INCLUDE_BLOCKED=1")
    params = HTTP::Params.parse("show_member_videos=0&include_blocked=0")
    expect(described_class.apply(env, params, true, true)).to be_false
    expect(env.response.cookies[Invidious::Frontend::SearchPreferences::MEMBER_COOKIE].value).to eq("0")
    expect(env.response.cookies[Invidious::Frontend::SearchPreferences::BLOCKED_COOKIE].value).to eq("0")
    expect(env.response.cookies[Invidious::Frontend::SearchPreferences::MEMBER_COOKIE].http_only).to be_true
    expect(env.response.cookies[Invidious::Frontend::SearchPreferences::MEMBER_COOKIE].secure).to be_true
    expect(env.response.cookies[Invidious::Frontend::SearchPreferences::MEMBER_COOKIE].path).to eq("/")
    expect(env.response.cookies["PREFS"]?).to be_nil

    checked = HTTP::Params.parse("show_member_videos=0&show_member_videos=1&include_blocked=0&include_blocked=1")
    expect(described_class.apply(search_context, checked, false)).to be_true
    expect(checked["include_blocked"]).to eq("1")
    expect(checked.fetch_all("show_member_videos")).to eq(["1"])
  end

  it "persists choices into a new search and lets an explicit URL override them" do
    params = HTTP::Params.parse("q=new&page=3")
    env = search_context("SEARCH_SHOW_MEMBER_VIDEOS=1; SEARCH_INCLUDE_BLOCKED=1")
    expect(described_class.apply(env, params, false)).to be_true
    expect(params["include_blocked"]).to eq("1")
    expect(params["page"]).to eq("3")
    params["show_member_videos"] = "0"
    expect(described_class.apply(env, params, true)).to be_false
  end

  it "resets membership to the account preference while keeping the blocked choice" do
    params = HTTP::Params.parse("q=cats&reset_member_videos=1&show_member_videos=1")
    env = search_context("SEARCH_SHOW_MEMBER_VIDEOS=1; SEARCH_INCLUDE_BLOCKED=1")
    expect(described_class.apply(env, params, false)).to be_false
    expect(params.has_key?("show_member_videos")).to be_false
    expect(params.has_key?("reset_member_videos")).to be_false
    expect(params["include_blocked"]).to eq("1")
    expect(env.response.cookies[Invidious::Frontend::SearchPreferences::MEMBER_COOKIE].expires).to eq(Time.unix(0))
  end

  it "ignores malformed cookies and parameters" do
    params = HTTP::Params.parse("q=cats&show_member_videos=invalid&include_blocked=invalid")
    env = search_context("SEARCH_SHOW_MEMBER_VIDEOS=invalid; SEARCH_INCLUDE_BLOCKED=invalid")
    expect(described_class.apply(env, params, false)).to be_false
    expect(params.has_key?("show_member_videos")).to be_false
    expect(params.has_key?("include_blocked")).to be_false
  end
end

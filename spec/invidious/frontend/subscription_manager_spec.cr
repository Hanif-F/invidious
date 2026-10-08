require "spec"
require "http/server"
require "kemal"
require "../../../src/invidious/history"
require "../../../src/invidious/frontend/subscription_manager"

private record SortingTestChannel, id : String, author : String

private def sorting_context(query = "", cookies = "")
  HTTP::Server::Context.new(HTTP::Request.new("GET", "/subscription_manager#{query}", HTTP::Headers{"Cookie" => cookies}), HTTP::Server::Response.new(IO::Memory.new))
end

describe Invidious::Frontend::SubscriptionManager do
  now = Time.utc(2026, 10, 7, 12)
  today = Time.utc(2026, 10, 7)

  it "defaults to A–Z, restores a valid browser choice, and lets the URL override it" do
    manager = Invidious::Frontend::SubscriptionManager
    manager.preference(sorting_context).should eq("alphabetical")
    manager.preference(sorting_context(cookies: "#{Invidious::Frontend::SubscriptionManager::COOKIE}=relevance")).should eq("relevance")
    env = sorting_context("?sort_by=most_watched", "#{Invidious::Frontend::SubscriptionManager::COOKIE}=relevance")
    manager.preference(env, true).should eq("most_watched")
    cookie = env.response.cookies[Invidious::Frontend::SubscriptionManager::COOKIE]
    cookie.value.should eq("most_watched")
    cookie.path.should eq("/")
    cookie.http_only.should be_true
    cookie.secure.should be_true
    cookie.samesite.should eq(HTTP::Cookie::SameSite::Lax)
    env.response.cookies["PREFS"]?.should be_nil
  end

  it "ignores malformed values without overwriting the saved choice" do
    manager = Invidious::Frontend::SubscriptionManager
    env = sorting_context("?sort_by=invalid", "#{Invidious::Frontend::SubscriptionManager::COOKIE}=latest")
    manager.preference(env).should eq("latest")
    env.response.cookies[Invidious::Frontend::SubscriptionManager::COOKIE]?.should be_nil
    manager.preference(sorting_context("?sort_by=invalid", "#{Invidious::Frontend::SubscriptionManager::COOKIE}=invalid")).should eq("alphabetical")
    manager.preference(sorting_context("?sort_by=latest&sort_by=relevance")).should eq("relevance")
  end

  it "starts accounts at defaults and restores only their own sort" do
    manager = Invidious::Frontend::SubscriptionManager
    env = sorting_context(cookies: "SUBSCRIPTION_MANAGER_SORT=relevance; SUBSCRIPTION_MANAGER_SORT_alice=latest")
    env.set "browser_profile", "bob"
    manager.preference(env).should eq("alphabetical")
    env.set "browser_profile", "alice"
    manager.preference(env).should eq("latest")
    save = sorting_context("?sort_by=most_watched")
    save.set "browser_profile", "alice"
    manager.preference(save).should eq("most_watched")
    save.response.cookies["SUBSCRIPTION_MANAGER_SORT_alice"].value.should eq("most_watched")
    save.response.cookies[Invidious::Frontend::SubscriptionManager::COOKIE]?.should be_nil
  end

  it "fades each distinct video's latest valid watch to zero exactly at day 90" do
    stats = Invidious::Frontend::SubscriptionManager::Stats.new
    stats.record_watch(today.to_s("%F"), [] of String, today)
    stats.record_watch((today - 89.days).to_s("%F"), [] of String, today)
    stats.record_watch((today - 90.days).to_s("%F"), [] of String, today)
    stats.record_watch(nil, [] of String, today)
    stats.all_time_watched.should eq(4)
    stats.recent_watched.should eq(2)
    stats.habit_weight.should be_close(1.0 + 1.0 / 90, 1e-10)
  end

  it "uses archived dates without counting repeats and ignores invalid or future dates" do
    stats = Invidious::Frontend::SubscriptionManager::Stats.new
    stats.record_watch((today + 1.day).to_s("%F"), [(today - 30.days).to_s("%F"), today.to_s("%F"), "bad", today.to_s("%F")], today)
    stats.record_watch("2026-02-30", [(today + 2.days).to_s("%F")], today)
    stats.all_time_watched.should eq(2)
    stats.recent_watched.should eq(1)
    stats.habit_weight.should eq(1.0)
  end

  it "adds a bounded freshness bonus and drops it at the seven-day boundary" do
    stats = Invidious::Frontend::SubscriptionManager::Stats.new
    stats.record_watch(today.to_s("%F"), [] of String, today)
    stats.fresh_upload = now
    stats.relevance(now).should eq(2.0)
    stats.fresh_upload = now - 7.days + 1.second
    stats.relevance(now).should be > 1.0
    stats.fresh_upload = now - 7.days
    stats.relevance(now).should eq(1.0)
    stats.fresh_upload = now + 1.second
    stats.relevance(now).should eq(1.0)
  end

  it "lets regular viewing outweigh freshness while dormant channels gain no relevance" do
    favorite = Invidious::Frontend::SubscriptionManager::Stats.new
    6.times { favorite.record_watch((today - 30.days).to_s("%F"), [] of String, today) }
    one_off = Invidious::Frontend::SubscriptionManager::Stats.new
    one_off.record_watch((today - 1.day).to_s("%F"), [] of String, today)
    one_off.fresh_upload = now - 1.day
    favorite.relevance(now).should be > one_off.relevance(now)
    favorite.fresh_upload = now - 1.day
    favorite.relevance(now).should be > one_off.relevance(now)
    dormant = Invidious::Frontend::SubscriptionManager::Stats.new
    100.times { dormant.record_watch((today - 90.days).to_s("%F"), [] of String, today) }
    dormant.fresh_upload = now
    dormant.relevance(now).should eq(0.0)
    dormant.all_time_watched.should eq(100)
  end

  it "sorts all four modes and resolves equal names, unknown uploads and zero scores deterministically" do
    manager = Invidious::Frontend::SubscriptionManager
    channels = [SortingTestChannel.new("b", "Same"), SortingTestChannel.new("a", "same"), SortingTestChannel.new("c", "Zulu")]
    stats = channels.to_h { |channel| {channel.id, Invidious::Frontend::SubscriptionManager::Stats.new} }
    stats["a"].latest_upload = now - 2.days
    stats["b"].latest_upload = now - 1.day
    3.times { stats["c"].record_watch((today - 90.days).to_s("%F"), [] of String, today) }
    stats["b"].record_watch(today.to_s("%F"), [] of String, today)
    manager.sort(channels, stats, "alphabetical", now).map(&.id).should eq(%w(a b c))
    manager.sort(channels, stats, "latest", now).map(&.id).should eq(%w(b a c))
    manager.sort(channels, stats, "most_watched", now).map(&.id).should eq(%w(c b a))
    manager.sort(channels, stats, "relevance", now).map(&.id).should eq(%w(b a c))
    empty_stats = {} of String => Invidious::Frontend::SubscriptionManager::Stats
    manager.sort(channels, empty_stats, "relevance", now).map(&.id).should eq(%w(a b c))
    manager.sort([] of SortingTestChannel, empty_stats, "latest", now).should be_empty
  end
end

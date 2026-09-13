# Uses a disposable PostgreSQL database only; no upstream network calls.
require "pg"
require "json"
require "../../src/invidious/history"
require "../../src/invidious/database/migration"
require "../../src/invidious/database/migrator"
require "../../src/invidious/database/migrations/0014_create_watch_history_table"

# Minimal domain types let this test exercise production persistence independently.
struct Preferences
  include JSON::Serializable
  property timezone : String? = nil
end

struct User
  getter email : String
  property watched = [] of String

  def initialize(@email)
  end
end

struct Video
  getter title = "Title"
  getter author = "Channel"
  getter ucid = "UCchannel"
  getter info = {} of String => JSON::Any
end

require "../../src/invidious/database/watch_history"
require "../../src/invidious/database/users"

url = ENV["HISTORY_TEST_DATABASE_URL"]
abort "A disposable invidious_history_test database is required" unless URI.parse(url).path == "/invidious_history_test"
PG_DB = DB.open(ENV["HISTORY_TEST_DATABASE_URL"])

def check(value, message)
  raise message unless value
end

history = Invidious::Database::WatchHistory
begin
  PG_DB.exec("CREATE TABLE users (email text PRIMARY KEY, watched text[] DEFAULT '{}', preferences text DEFAULT '{}')")
  PG_DB.exec("CREATE TABLE videos (id text, info text)")
  PG_DB.exec("CREATE TABLE channel_videos (id text, title text, author text, ucid text, published timestamptz)")
  PG_DB.using_connection do |conn|
    migration = Invidious::Database::Migrations::CreateWatchHistoryTable.new(PG_DB)
    migration.up(conn)
    migration.up(conn)
  end
  2.times do |schema|
    PG_DB.exec("INSERT INTO users (email) VALUES ('a'), ('b')")
    PG_DB.exec("UPDATE users SET preferences = $1", {timezone: "Asia/Jakarta"}.to_json)
    user = User.new("a")
    history.record(user, "video")
    entry = history.select_all("a").first
    check(entry.latest_watched == Invidious::History.today("Asia/Jakarta"), "First watch must record account date")
    check(entry.archived_dates.empty?, "First watch has no archive")
    history.record(user, "video")
    check(history.select_all("a").first.archived_dates.empty?, "Same-day watch must deduplicate")
    PG_DB.exec("UPDATE watch_history SET latest_watched = '2020-01-01', title = 'Saved', channel_name = 'Channel', channel_id = 'UCsaved', release_date = '2019-01-01' WHERE email = 'a'")
    history.record(user, "video")
    entry = history.select_all("a").first
    check(entry.archived_dates == ["2020-01-01"], "Later watch must archive prior day")
    check(entry.title == "Saved" && entry.release_date == "2019-01-01", "Missing cache must preserve metadata")
    done = Channel(Exception?).new
    8.times do
      spawn do
        begin
          history.record(user, "video")
          done.send(nil)
        rescue ex
          done.send(ex)
        end
      end
    end
    8.times { if ex = done.receive
      raise ex
    end }
    check(history.select_all("a").first.archived_dates == ["2020-01-01"], "Concurrent recording must retain unique dates")
    check(history.select_all("b").empty?, "Account isolation")
    user.watched = ["video", "legacy"]
    PG_DB.exec("UPDATE users SET watched = $1 WHERE email = 'a'", user.watched)
    PG_DB.exec("INSERT INTO videos VALUES ('legacy', $1)", {title: "Legacy", author: "Old channel", ucid: "UClegacy", published: "2018-01-01"}.to_json)
    entries = history.entries(user)
    check(entries.find { |e| e.video_id == "legacy" }.not_nil!.latest_watched.nil?, "Legacy date must remain unknown")
    PG_DB.exec("DELETE FROM videos")
    check(history.entries(user).find { |e| e.video_id == "legacy" }.not_nil!.title == "Legacy", "Backfill survives cache eviction")
    exported = JSON.parse(entries.to_json).as_a
    history.import(user, exported)
    check(history.select_all("a").find { |e| e.video_id == "video" }.not_nil!.archived_dates == ["2020-01-01"], "Export/import retains archive")
    history.record(User.new("b"), "video")
    Invidious::Database::Users.mark_unwatched(user, "video")
    check(history.select_all("a").none? { |e| e.video_id == "video" }, "Removal deletes archived metadata")
    Invidious::Database::Users.clear_watch_history(user)
    check(history.select_all("a").empty?, "Clear removes all history details")
    check(PG_DB.query_one("SELECT watched FROM users WHERE email = 'a'", as: Array(String)).empty?, "Clear removes compatibility IDs")
    check(history.select_all("b").size == 1, "Clear must preserve other accounts")
    PG_DB.exec("DELETE FROM users")
    check(history.select_all("a").empty?, "Account deletion cascades")
    if schema == 0
      PG_DB.exec("DROP TABLE watch_history")
      PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/watch_history.sql")) }
    end
  end
  puts "History migration, fresh schema, concurrency, metadata, dates, isolation, and import checks passed"
ensure
  PG_DB.close
end

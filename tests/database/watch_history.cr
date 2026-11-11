# Uses a disposable PostgreSQL database only; no upstream network calls.
require "pg"
require "json"
require "../../src/invidious/history"
require "../../src/invidious/database/migration"
require "../../src/invidious/database/migrator"
require "../../src/invidious/database/migrations/0014_create_watch_history_table"
require "../../src/invidious/database/migrations/0016_add_history_duration"
require "../../src/invidious/database/migrations/0027_watch_history_completion"

# Minimal domain types let this test exercise production persistence independently.
struct Preferences
  include JSON::Serializable
  property timezone : String? = nil
  property watch_history : Bool = true
end

struct User
  getter email : String
  property watched = [] of String

  def initialize(@email)
  end
end

struct Video
  getter length_seconds = 600
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
  PG_DB.exec("CREATE TABLE channel_videos (id text, title text, author text, ucid text, published timestamptz, length_seconds integer)")
  PG_DB.using_connection do |conn|
    migration = Invidious::Database::Migrations::CreateWatchHistoryTable.new(PG_DB)
    migration.up(conn)
    migration.up(conn)
    conn.exec("INSERT INTO users (email) VALUES ('migration')")
    conn.exec("INSERT INTO watch_history (email, video_id) VALUES ('migration', 'old')")
    duration_migration = Invidious::Database::Migrations::AddHistoryDuration.new(PG_DB)
    duration_migration.up(conn)
    duration_migration.up(conn)
    check(conn.query_one("SELECT length_seconds FROM watch_history WHERE email = 'migration'", as: Int32?).nil?, "Migration must retain legacy rows with unknown duration")
    completion_migration = Invidious::Database::Migrations::WatchHistoryCompletion.new(PG_DB)
    completion_migration.up(conn)
    completion_migration.up(conn)
    check(!conn.query_one("SELECT completed FROM watch_history WHERE email = 'migration'", as: Bool), "Legacy history cannot imply completion")
    conn.exec("DELETE FROM users WHERE email = 'migration'")
  end
  2.times do |schema|
    PG_DB.exec("INSERT INTO users (email) VALUES ('a'), ('b')")
    PG_DB.exec("UPDATE users SET preferences = $1", {timezone: "Asia/Jakarta"}.to_json)
    user = User.new("a")
    history.record(user, "video")
    entry = history.select_all("a").first
    check(entry.latest_watched == Invidious::History.today("Asia/Jakarta"), "First watch must record account date")
    check(entry.archived_dates.empty?, "First watch has no archive")
    check(!entry.completed && history.completed_ids("a").empty?, "Opening a watch page must not imply completion")
    history.record(user, "video")
    check(history.select_all("a").first.archived_dates.empty?, "Same-day watch must deduplicate")
    PG_DB.exec("UPDATE watch_history SET latest_watched = '2020-01-01', title = 'Saved', channel_name = 'Channel', channel_id = 'UCsaved', release_date = '2019-01-01' WHERE email = 'a'")
    history.record(user, "video")
    entry = history.select_all("a").first
    check(entry.archived_dates == ["2020-01-01"], "Later watch must archive prior day")
    check(entry.title == "Saved" && entry.release_date == "2019-01-01", "Missing cache must preserve metadata")
    history.record(user, "video", Video.new)
    check(history.select_all("a").first.length_seconds == 600, "Recording known video must save duration")
    history.record(user, "video")
    check(history.select_all("a").first.length_seconds == 600, "Unknown duration must preserve saved duration")
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
    check(history.complete(user, "video"), "Playback completion must succeed")
    completed = history.select_all("a").first
    check(completed.completed, "Playback completion must update an existing entry")
    check(history.complete(user, "video") && history.select_all("a").first.to_json == completed.to_json, "Completion retries must be idempotent")
    check(history.record(user, "video") && history.select_all("a").first.completed, "Reopening a video must preserve completion")
    PG_DB.exec("UPDATE users SET preferences = $1 WHERE email = 'a'", {timezone: "Asia/Jakarta", watch_history: false}.to_json)
    check(!history.complete(user, "paused") && !Invidious::Database::Users.mark_watched(user, "paused"), "A history pause must block new completion marks")
    check(history.completed_ids("a") == ["video"], "History pause must preserve existing marks")
    PG_DB.exec("UPDATE users SET preferences = $1 WHERE email = 'a'", {timezone: "Asia/Jakarta"}.to_json)

    other = User.new("b")
    check(history.complete(other, "embed"), "Embed playback completion must create history")
    check(history.completed_ids("b") == ["embed"], "Embed completion must belong to its account")
    Invidious::Database::Users.mark_unwatched(other, "embed")
    check(history.completed_ids("b").empty?, "Mark unwatched must remove completion")
    check(Invidious::Database::Users.mark_watched(other, "manual"), "Mark watched must succeed")
    check(history.completed_ids("b") == ["manual"], "Mark watched must record completion")
    Invidious::Database::Users.mark_unwatched(other, "manual")
    user.watched = ["video", "legacy"]
    PG_DB.exec("UPDATE users SET watched = $1 WHERE email = 'a'", user.watched)
    PG_DB.exec("INSERT INTO videos VALUES ('legacy', $1)", {title: "Legacy", author: "Old channel", ucid: "UClegacy", published: "2018-01-01", lengthSeconds: 900}.to_json)
    entries = history.entries(user)
    check(entries.find { |e| e.video_id == "legacy" }.not_nil!.length_seconds == 900, "Recover duration from local video cache")
    check(entries.find { |e| e.video_id == "legacy" }.not_nil!.latest_watched.nil?, "Legacy date must remain unknown")
    PG_DB.exec("DELETE FROM videos")
    check(history.entries(user).find { |e| e.video_id == "legacy" }.not_nil!.title == "Legacy", "Backfill survives cache eviction")
    check(history.entries(user).find { |e| e.video_id == "legacy" }.not_nil!.length_seconds == 900, "Duration survives cache eviction")
    PG_DB.exec("UPDATE watch_history SET length_seconds = NULL WHERE video_id = 'legacy' AND email = 'a'")
    PG_DB.exec("INSERT INTO channel_videos VALUES ('legacy', 'Legacy', 'Old channel', 'UClegacy', '2018-01-01', 1200)")
    PG_DB.exec("INSERT INTO videos VALUES ('legacy', $1)", {lengthSeconds: 0}.to_json)
    check(history.entries(user).find { |e| e.video_id == "legacy" }.not_nil!.length_seconds == 1200, "Backfill duration even when other metadata is complete; invalid cache duration must not replace valid duration")
    PG_DB.exec("DELETE FROM channel_videos")
    PG_DB.exec("DELETE FROM videos")
    history.import(user, [JSON.parse(%({"video_id":"legacy","length_seconds":-5}))])
    check(history.select_all("a").find { |e| e.video_id == "legacy" }.not_nil!.length_seconds == 1200, "Invalid imported duration must not erase valid duration")
    exported = JSON.parse(entries.to_json).as_a
    PG_DB.exec("UPDATE watch_history SET length_seconds = NULL WHERE email = 'a'")
    history.import(user, exported)
    check(history.select_all("a").find { |e| e.video_id == "legacy" }.not_nil!.length_seconds == 900, "Export/import retains duration")
    history.import(user, [JSON.parse(%({"video_id":"legacy"}))])
    check(history.select_all("a").find { |e| e.video_id == "legacy" }.not_nil!.length_seconds == 900, "Older imports must not erase duration")
    check(history.select_all("a").find { |e| e.video_id == "video" }.not_nil!.archived_dates == ["2020-01-01"], "Export/import retains archive")
    history.record(other, "video")
    history.import(other, exported)
    check(history.completed_ids("b") == ["video"], "History backup round trip must restore completion")
    history.import(user, [JSON.parse(%({"video_id":"video"}))])
    check(history.completed_ids("a") == ["video"], "An older backup must preserve existing completion")
    check(!history.select_all("a").find { |e| e.video_id == "legacy" }.not_nil!.completed, "A legacy import cannot infer completion")
    Invidious::Database::Users.mark_unwatched(user, "video")
    check(history.select_all("a").none? { |e| e.video_id == "video" }, "Removal deletes archived metadata")
    check(history.completed_ids("a").empty?, "Removal deletes the completion mark")
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

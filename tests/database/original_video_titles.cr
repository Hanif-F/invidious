# Requires an empty disposable invidious_original_titles_test database.
require "pg"
require "../../src/invidious/database/migration"
require "../../src/invidious/database/migrator"
require "../../src/invidious/database/migrations/0001_create_channels_table"
require "../../src/invidious/database/migrations/0024_create_original_video_titles"
require "../../src/invidious/database/original_video_titles"

url = ENV["ORIGINAL_TITLES_TEST_DATABASE_URL"]
abort "An empty disposable invidious_original_titles_test database is required" unless URI.parse(url).path == "/invidious_original_titles_test"
PG_DB = DB.open(ENV["ORIGINAL_TITLES_TEST_DATABASE_URL"])

def check(value, message)
  raise message unless value
end

begin
  check(PG_DB.query_one("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'", as: Int64) == 0, "Disposable database must be empty")
  migrator = Invidious::Database::Migrator.new(PG_DB)
  migrator.migrate
  migrator.migrate
  check(PG_DB.query_one("SELECT count(*) FROM invidious_migrations WHERE version = 24", as: Int64) == 1, "Migration was not tracked exactly once")
  cache = Invidious::Database::OriginalVideoTitles
  now = Time.utc
  cache.save("aaaaaaaaaaa", Invidious::OriginalTitles::Entry.new("原題 <日本語> & café", now + 6.hours))
  cache.save("bbbbbbbbbbb", Invidious::OriginalTitles::Entry.new(nil, now + 10.minutes))
  cache.save("ccccccccccc", Invidious::OriginalTitles::Entry.new("Expired", now - 1.second))
  check(cache.select([] of String).empty?, "Empty lookup was not empty")
  entries = cache.select(%w(aaaaaaaaaaa bbbbbbbbbbb ccccccccccc ddddddddddd))
  check(entries.size == 2 && entries["aaaaaaaaaaa"].title == "原題 <日本語> & café" && entries["bbbbbbbbbbb"].title.nil?, "Durable positive/negative lookup failed")
  cache.save("aaaaaaaaaaa", Invidious::OriginalTitles::Entry.new("Older", now + 1.hour))
  check(cache.select(["aaaaaaaaaaa"])["aaaaaaaaaaa"].title == "原題 <日本語> & café", "Older observation replaced a fresh title")
  cache.delete_expired
  check(PG_DB.query_one("SELECT count(*) FROM original_video_titles", as: Int64) == 2, "Expired cache cleanup failed")

  calls = 0
  client = Invidious::OriginalTitles::Client.new(
    ->(_id : String) { calls += 1; Invidious::OriginalTitles::Result.new("Français", 6.hours) },
    ->(ids : Array(String)) { cache.select(ids) },
    ->(id : String, entry : Invidious::OriginalTitles::Entry) { cache.save(id, entry) })
  client.resolve(%w(aaaaaaaaaaa bbbbbbbbbbb ddddddddddd), Invidious::OriginalTitles.clock + 5.seconds)
  check(calls == 1 && cache.select(["ddddddddddd"])["ddddddddddd"].title == "Français", "Cache reuse or lookup persistence failed")
  PG_DB.exec("DROP TABLE original_video_titles")
  check(client.resolve(["eeeeeeeeeee"], Invidious::OriginalTitles.clock + 5.seconds)["eeeeeeeeeee"] == "Français", "Cache outage failed the title lookup")
  check(calls == 2, "Unexpected requests during cache outage")
  client.resolve(["eeeeeeeeeee"], Invidious::OriginalTitles.clock + 5.seconds)
  check(calls == 2, "Cache outage bypassed memory cache")
  2.times do
    PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/original_video_titles.sql")) }
  end
  check(cache.select(["aaaaaaaaaaa"]).empty?, "Fresh-install cache was not empty")
  puts "Original-title migration, durable positive/negative cache, expiry, failure isolation and fresh-install checks passed"
ensure
  PG_DB.close
end

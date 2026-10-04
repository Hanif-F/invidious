# Run only against an empty disposable database named invidious_avatars_test.
require "pg"
require "../../src/invidious/database/migration"
require "../../src/invidious/database/migrator"
require "../../src/invidious/database/migrations/0001_create_channels_table"
require "../../src/invidious/database/migrations/0021_create_channel_avatars_table"
require "../../src/invidious/database/channel_avatars"

url = ENV["AVATAR_TEST_DATABASE_URL"]
abort "An empty disposable invidious_avatars_test database is required" unless URI.parse(url).path == "/invidious_avatars_test"
PG_DB = DB.open(ENV["AVATAR_TEST_DATABASE_URL"])

def check(value, message)
  raise message unless value
end

def check_avatar_cache
  cache = Invidious::Database::ChannelAvatars
  old = Time.utc - 3650.days
  recent = Time.utc
  check(cache.select([] of String).empty?, "Empty batch was not empty")
  check(cache.select(["missing"]).empty?, "Cache miss produced an avatar")
  check(cache.observe({"UCfirst" => "https://yt3.ggpht.com/first=s48", "UCsecond" => "https://yt3.ggpht.com/second=s176"}, old), "Batch insert failed")
  check(cache.select(["UCfirst", "UCsecond"]) == {"UCfirst" => "/ggpht/first=s88", "UCsecond" => "/ggpht/second=s88"}, "Batch persistence or old cache reuse failed")
  check(cache.observe({"UCfirst" => "https://yt3.ggpht.com/new=s48"}, recent), "Replacement failed")
  cache.observe({"UCfirst" => "https://yt3.ggpht.com/old=s48"}, old)
  cache.observe({"UCfirst" => "", "invalid" => "https://example.test/avatar", "" => "https://yt3.ggpht.com/avatar"}, recent + 1.second)
  check(cache.select(["UCfirst"])["UCfirst"] == "/ggpht/new=s88", "Older or invalid observations erased a known avatar")
  check(PG_DB.query_one("SELECT count(*) FROM channel_avatars", as: Int64) == 2, "Invalid observations created cache records")

  done = Channel(Bool).new
  8.times do |i|
    spawn { done.send(cache.observe({"UCconcurrent" => "https://yt3.ggpht.com/#{i}=s48"}, recent + i.seconds)) }
  end
  8.times { check(done.receive, "Concurrent observation failed") }
  check(cache.select(["UCconcurrent"])["UCconcurrent"] == "/ggpht/7=s88", "Concurrent observations lost the newest URL")
  check(PG_DB.query_one("SELECT count(*) FROM channels", as: Int64) == 0, "Avatar observations expanded the channel crawler")
end

begin
  check(PG_DB.query_one("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'", as: Int64) == 0, "Disposable database must be empty")
  migrator = Invidious::Database::Migrator.new(PG_DB)
  migrator.migrate
  migrator.migrate
  check(PG_DB.query_one("SELECT count(*) FROM invidious_migrations WHERE version = 21", as: Int64) == 1, "Migration was not tracked exactly once")
  check(PG_DB.query_one("SELECT count(*) FROM channel_avatars", as: Int64) == 0, "Migration unexpectedly seeded avatars")
  PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/channels.sql")) }
  check_avatar_cache

  PG_DB.exec("DROP TABLE channel_avatars")
  check(Invidious::Database::ChannelAvatars.select(["UCfirst"]).empty?, "Read failure did not fall back")
  check(!Invidious::Database::ChannelAvatars.observe({"UCfirst" => "https://yt3.ggpht.com/a"}), "Write failure was not isolated")
  PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/channel_avatars.sql")) }
  check_avatar_cache
  puts "Avatar migration, persistence, freshness, concurrency, failure fallback, and fresh-install checks passed"
ensure
  PG_DB.close
end

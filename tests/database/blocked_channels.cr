# Run only against a disposable database named invidious_blocking_test.
require "pg"
require "../../src/invidious/database/migration"
require "../../src/invidious/database/migrator"
require "../../src/invidious/database/migrations/0011_create_playback_positions_table"
require "../../src/invidious/database/migrations/0012_create_blocked_channels_table"
require "../../src/invidious/database/blocked_channels"

url = ENV["BLOCKING_TEST_DATABASE_URL"]
abort "A disposable invidious_blocking_test database is required" unless URI.parse(url).path == "/invidious_blocking_test"
PG_DB = DB.open(ENV["BLOCKING_TEST_DATABASE_URL"])

def check(value, message)
  raise message unless value
end

begin
  PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/users.sql")) }
  migrator = Invidious::Database::Migrator.new(PG_DB)
  migrator.migrate
  migrator.migrate
  PG_DB.exec("INSERT INTO users (email) VALUES ('a@test'), ('b@test')")
  blocked = Invidious::Database::BlockedChannels
  channel = "UCaaaaaaaaaaaaaaaaaaaaaa"
  blocked.block("a@test", channel, "A channel")
  blocked.block("a@test", channel, "A channel")
  check(blocked.ids("a@test") == [channel], "Blocking must be idempotent")
  check(blocked.ids("b@test").empty?, "Blocks must be account scoped")
  blocked.unblock("b@test", channel)
  check(blocked.ids("a@test") == [channel], "Another account cannot unblock this channel")
  blocked.unblock("a@test", channel)
  blocked.unblock("a@test", channel)
  check(blocked.ids("a@test").empty?, "Unblocking must be idempotent")
  blocked.block("a@test", channel, "A channel")
  blocked.block("b@test", channel, "A channel")
  PG_DB.exec("DELETE FROM users WHERE email = 'a@test'")
  check(blocked.ids("a@test").empty?, "Deleting an account must remove its blocks")
  check(blocked.ids("b@test") == [channel], "Account deletion must preserve other users' blocks")
  PG_DB.exec("DELETE FROM users WHERE email = 'b@test'")
  # Check the fresh-install definition independently of the migration.
  PG_DB.exec("DROP TABLE blocked_channels")
  PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/blocked_channels.sql")) }
  check(blocked.ids("a@test").empty?, "Fresh-install schema must support the same queries")
  puts "Blocked-channel migration, isolation, idempotency, deletion, and fresh-install checks passed"
ensure
  PG_DB.close
end

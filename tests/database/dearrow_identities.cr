# Run only against a disposable database named invidious_dearrow_test.
require "pg"
require "../../src/invidious/database/migration"
require "../../src/invidious/database/migrator"
require "../../src/invidious/database/migrations/0004_create_users_table"
require "../../src/invidious/database/migrations/0013_create_dearrow_identities_table"
require "../../src/invidious/dearrow_identity"
require "../../src/invidious/database/dearrow_identities"

url = ENV["DEARROW_TEST_DATABASE_URL"]
abort "A disposable invidious_dearrow_test database is required" unless URI.parse(url).path == "/invidious_dearrow_test"
PG_DB = DB.open(ENV["DEARROW_TEST_DATABASE_URL"])

begin
  PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/users.sql")) }
  migrator = Invidious::Database::Migrator.new(PG_DB)
  migrator.migrate
  migrator.migrate
  2.times do |iteration|
    PG_DB.exec("INSERT INTO users (email) VALUES ('alice@test'), ('bob@test')")
    store = Invidious::Database::DeArrowIdentities
    key = "ab" * 32
    identities = Channel(String).new(8)
    8.times { spawn { identities.send(store.identity("alice@test", key)) } }
    values = Array.new(8) { identities.receive }
    raise "Concurrent sessions diverged" unless values.uniq.size == 1
    alice = values.first
    bob = store.identity("bob@test", key)
    raise "Accounts share an identity" if alice == bob
    store.import("alice@test", "cd" * 32, key)
    raise "Import was lost" unless store.identity("alice@test", key) == "cd" * 32
    raise "Import modified another account" unless store.identity("bob@test", key) == bob
    PG_DB.exec("DELETE FROM users WHERE email = 'alice@test'")
    raise "Deleted account identity survived" if store.configured?("alice@test")
    raise "Another identity was deleted" unless store.configured?("bob@test")
    PG_DB.exec("DELETE FROM users WHERE email = 'bob@test'")
    if iteration == 0
      PG_DB.exec("DROP TABLE dearrow_identities")
      PG_DB.using_connection { |conn| conn.as(PG::Connection).exec_all(File.read("config/sql/dearrow_identities.sql")) }
    end
  end
  puts "DeArrow migration, concurrent identity creation, import, isolation and cascade checks passed for migrated and fresh schemas"
ensure
  PG_DB.close
end

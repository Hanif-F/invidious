# Run only against the disposable invidious_ai_slist_test database.
require "pg"
require "../../src/invidious/database/migration"
require "../../src/invidious/database/migrator"
require "../../src/invidious/database/migrations/0001_create_channels_table"
require "../../src/invidious/database/migrations/0022_create_ai_slist_cache"
require "../../src/invidious/database/ai_slist"

url = ENV["AI_SLIST_TEST_DATABASE_URL"]
abort "A disposable invidious_ai_slist_test database is required" unless URI.parse(url).path == "/invidious_ai_slist_test"
PG_DB = DB.open(ENV["AI_SLIST_TEST_DATABASE_URL"])

begin
  migrator = Invidious::Database::Migrator.new(PG_DB)
  migrator.migrate
  migrator.migrate
  raise "Migration tracking failed" unless PG_DB.query_one("SELECT count(*) FROM public.invidious_migrations WHERE version = 22", as: Int64) == 1
  2.times do |iteration|
    storage = Invidious::Database::AiSListStorage.new
    now = Time.utc
    id = "UC#{"a" * 22}"
    storage.save_list("blocklist", "@Blocked", now)
    storage.save_list("warnlist", "@Warned", now - 7.hours)
    lists = Invidious::AiSList::Lists.new(storage, ->(_kind : String) { raise "offline"; "" })
    lists.restore
    raise "Snapshot persistence failed" unless lists.snapshot("blocklist").not_nil!.entries.handles.includes?("@blocked")
    raise "Stale status failed" if lists.stale?("blocklist") || !lists.stale?("warnlist")
    lists.refresh
    raise "Failed refresh erased data" unless storage.load_lists.size == 2
    entry = Invidious::AiSList::HandleEntry.new("@creator", now, now + 7.days)
    storage.save_handles({id => entry})
    storage.save_handles({id => Invidious::AiSList::HandleEntry.new("@older", now - 1.hour, now + 1.day)})
    loaded = storage.load_handles([id, "UC#{"b" * 22}"])
    raise "Older observation won" unless loaded.size == 1 && loaded[id].handle == "@creator"
    storage.save_handles({id => Invidious::AiSList::HandleEntry.new(nil, now + 1.second, now + 1.hour)})
    raise "Negative cache lost" unless storage.load_handles([id])[id].handle.nil?
    if iteration == 0
      PG_DB.exec("DROP TABLE ai_slist_snapshots, channel_handles")
      PG_DB.using_connection do |conn|
        conn.as(PG::Connection).exec_all(File.read("config/sql/ai_slist_snapshots.sql"))
        conn.as(PG::Connection).exec_all(File.read("config/sql/channel_handles.sql"))
      end
    end
  end
  puts "AiSList migration, fresh schema, snapshots, stale status and handle-cache checks passed"
ensure
  PG_DB.close
end

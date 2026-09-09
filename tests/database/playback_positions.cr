# Included by blocked_channels.cr; uses the same disposable PostgreSQL database.
require "json"
require "../../src/invidious/database/playback_positions"
require "../../src/invidious/user/imports"

def check_playback_positions
  positions = Invidious::Database::PlaybackPositions
  now = Time.utc
  id = "abcdefghijk"
  positions.upsert("a@test", id, 42, now)
  check(positions.select("a@test", id).not_nil![:position_seconds] == 42, "Progress must round trip")
  check(positions.select("b@test", id).nil?, "Progress must be account scoped")
  positions.upsert("a@test", id, 10, now - 1.minute)
  check(positions.select("a@test", id).not_nil![:position_seconds] == 42, "Older imports must not overwrite newer progress")
  positions.upsert("b@test", id, 70, now)
  positions.delete("b@test", id)
  check(positions.select("a@test", id).not_nil![:position_seconds] == 42, "Deleting progress must preserve other accounts")

  expired = now - Invidious::Database::PlaybackPositions::RETENTION_PERIOD - 1.day
  positions.upsert("a@test", "expired0001", 1, expired)
  check(positions.select("a@test", "expired0001").nil?, "Expired progress must not resume")
  check(positions.select_all("a@test").size == 1, "Exports must exclude expired progress")
  positions.delete_expired
  check(PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE video_id = 'expired0001'", as: Int64) == 0, "Cleanup must delete expired rows")

  # Import parsing and production storage together, including an invalid entry.
  entries = JSON.parse(%([null, {"video_id":"future00001","position":99,"updated_at":9223372036854775807}])).as_a
  Invidious::User::Import.parse_playback_positions(entries, now).each do |entry|
    positions.upsert("a@test", entry[:video_id], entry[:position], entry[:updated_at])
  end
  check(positions.select("a@test", "future00001").not_nil![:position_seconds] == 99, "Valid progress must survive malformed import entries")

  positions.clear("a@test")
  positions.upsert("b@test", id, 70, now)
  check(positions.select_all("a@test").empty?, "Clearing progress must remove all account entries")
  check(positions.select("b@test", id).not_nil![:position_seconds] == 70, "Clearing progress must preserve other accounts")
  (0..Invidious::Database::PlaybackPositions::MAX_POSITIONS_PER_USER).each do |i|
    positions.upsert("a@test", i.to_s.rjust(11, '0'), i, now - i.seconds)
  end
  check(positions.select_all("a@test").size == Invidious::Database::PlaybackPositions::MAX_POSITIONS_PER_USER, "Progress must respect the account limit")
  check(positions.select("a@test", "00000000000") != nil, "Pruning must keep the newest entry")
  check(positions.select("a@test", "00000001000").nil?, "Pruning must remove the oldest entry")
  check(positions.select("b@test", id) != nil, "Pruning must preserve other accounts")
  puts "Playback progress import, isolation, retention, stale updates, cleanup, and pruning checks passed"
end

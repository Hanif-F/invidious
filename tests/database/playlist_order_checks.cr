# Production route and database checks, loaded by the guarded accounts harness.
def check_playlist_order
  enabled = CONFIG.login_enabled
  CONFIG.login_enabled = true
  password = "an isolated playlist ordering password"
  sid = Invidious::Database::Accounts.register("OrderOwner", password, Preferences.from_json("{}"))
  other_sid = Invidious::Database::Accounts.register("OrderOther", password, Preferences.from_json("{}"))
  owner = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(sid).not_nil!)
  list = create_playlist("Occurrence order", PlaylistPrivacy::Private, owner)
  original = [9_007_199_254_740_993_i64, 9_007_199_254_740_995_i64, 42_i64, 43_i64, 44_i64]
  original.each do |index|
    video = PlaylistVideo.new({title: "Duplicate", id: "abcdefghijk", author: "Owner", ucid: "UCowner", length_seconds: 10,
                               published: Time.utc, plid: list.id, index: index, live_now: false, members_only: false})
    Invidious::Database::PlaylistVideos.insert(video)
    Invidious::Database::Playlists.update_video_added(list.id, index)
  end
  url = "/playlist_ajax?action=move_video_before&redirect=false&playlist_id=#{list.id}"
  token = generate_response(sid, {"POST:playlist_ajax"}, HMAC_KEY)
  fields = {"source" => original[0].to_s, "anchor" => "43", "placement" => "after", "csrf_token" => token}
  response = security_request("POST", url, sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  check(response.response.status_code == 200, "Owner reorder failed")
  order = PG_DB.query_one("SELECT index FROM playlists WHERE id=$1", list.id, as: Array(Int64))
  check(order == [original[1], 42_i64, 43_i64, original[0], 44_i64], "Reorder lost precision, duplicates, or unloaded entries")
  check(PG_DB.query_one("SELECT video_count FROM playlists WHERE id=$1", list.id, as: Int32) == 5, "Reorder changed playlist count")
  check(PG_DB.query_one("SELECT count(*) FROM playlist_videos WHERE plid=$1", list.id, as: Int64) == 5, "Reorder changed occurrences")
  fields["anchor"] = "99999"
  check(security_request("POST", url, sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code == 409, "Stale anchor accepted")
  fields["anchor"] = "42"
  fields["placement"] = "invalid"
  check(security_request("POST", url, sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code == 400, "Invalid placement accepted")
  fields["placement"] = "before"
  check(security_request("POST", url, sid: other_sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code >= 400, "Another account reordered the playlist")
  fields["csrf_token"] = "forged"
  check(security_request("POST", url, sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code >= 400, "Reorder bypassed CSRF")
  check(PG_DB.query_one("SELECT index FROM playlists WHERE id=$1", list.id, as: Array(Int64)) == order, "Rejected reorder changed the playlist")
  PG_DB.exec("UPDATE playlists SET index=$1 WHERE id=$2", original, list.id)
  outcomes = Channel(Symbol).new(2)
  spawn { outcomes.send(Invidious::Database::Playlists.move_video(list.id, owner.email, original[0], 43_i64, false)) }
  spawn { outcomes.send(Invidious::Database::Playlists.move_video(list.id, owner.email, original[1], 44_i64, true)) }
  check(Array.new(2) { outcomes.receive }.all? { |outcome| outcome == :ok }, "Concurrent reorder failed")
  check(PG_DB.query_one("SELECT index FROM playlists WHERE id=$1", list.id, as: Array(Int64)) == [42_i64, original[0], 43_i64, 44_i64, original[1]], "Concurrent reorder lost an update")
  outcomes = Channel(Symbol).new(2)
  spawn { outcomes.send(Invidious::Database::Playlists.move_video(list.id, owner.email, original[0], 44_i64, true)) }
  spawn { Invidious::Database::Playlists.update_video_added(list.id, 55_i64); outcomes.send(:ok) }
  2.times { check(outcomes.receive == :ok, "Concurrent addition/reorder failed") }
  final = PG_DB.query_one("SELECT index FROM playlists WHERE id=$1", list.id, as: Array(Int64))
  check(final.size == 6 && final.includes?(55_i64) && final.uniq.size == 6, "Reorder lost a concurrent addition")
  puts "Playlist reorder ownership, CSRF, precision, occurrence identity, stale anchors and concurrent updates passed"
ensure
  CONFIG.login_enabled = enabled unless enabled.nil?
end

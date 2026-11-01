# Real transactional and HTML/JSON production-route checks. No upstream requests.
def check_library_workflows
  enabled = CONFIG.login_enabled
  CONFIG.login_enabled = true
  sid = Invidious::Database::Accounts.register("LibraryOwner", "a disposable library check password", Preferences.from_json("{}"))
  other_sid = Invidious::Database::Accounts.register("LibraryOther", "a disposable library check password", Preferences.from_json("{}"))
  owner = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(sid).not_nil!)
  other = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(other_sid).not_nil!)
  list = Invidious::Playlists::Playlists.create_playlist("Transactional entries", PlaylistPrivacy::Private, owner)
  first = PlaylistVideo.new({title: "Duplicate", id: "abcdefghijk", author: "Channel", ucid: "UCfixture", length_seconds: 10, published: Time.utc, plid: list.id, index: 9_007_199_254_740_993_i64, live_now: false, members_only: false})
  second = first.dup; second.index += 2
  appended = [] of Int64
  check(Invidious::Database::Playlists.append_video(list.id, owner.email, first, appended) == {:ok, 0}, "First append has the wrong ordinal")
  check(appended == [first.index], "Append did not capture its canonical occurrence snapshot")
  check(Invidious::Database::Playlists.append_video(list.id, other.email, second)[0] == :forbidden, "Foreign append succeeded")
  check(Invidious::Database::Playlists.remove_video(list.id, other.email, first.index) == :forbidden, "Foreign removal succeeded")
  check(Invidious::Database::Playlists.remove_video(list.id, owner.email, 999_i64) == :conflict, "A stale occurrence was removed")

  PG_DB.exec("CREATE FUNCTION reject_library_update() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''test rollback''; END'")
  PG_DB.exec("CREATE TRIGGER reject_library_update BEFORE UPDATE ON playlists FOR EACH ROW EXECUTE FUNCTION reject_library_update()")
  must_fail("Append failure did not surface") { Invidious::Database::Playlists.append_video(list.id, owner.email, second) }
  must_fail("Removal failure did not surface") { Invidious::Database::Playlists.remove_video(list.id, owner.email, first.index) }
  check(PG_DB.query_one("SELECT count(*) FROM playlist_videos WHERE plid=$1", list.id, as: Int64) == 1, "Failed occurrence change did not roll back its rows")
  check(PG_DB.query_one("SELECT index FROM playlists WHERE id=$1", list.id, as: Array(Int64)) == [first.index], "Failed occurrence change changed the index")
  PG_DB.exec("DROP TRIGGER reject_library_update ON playlists")
  PG_DB.exec("DROP FUNCTION reject_library_update()")
  check(Invidious::Database::Playlists.append_video(list.id, owner.email, second) == {:ok, 1}, "Duplicate video occurrence was not appended separately")
  check(Invidious::Database::Playlists.occurrence_offset(list.id, first.index, first.id, owner.email) == 0, "First occurrence cursor differs")
  check(Invidious::Database::Playlists.occurrence_offset(list.id, second.index, second.id, owner.email) == 1, "Later duplicate selected the first occurrence")
  check(Invidious::Database::Playlists.occurrence_offset(list.id, second.index, second.id, other.email).nil?, "Private order leaked to another account")
  check(Invidious::Database::Playlists.occurrence_offset(list.id, second.index, second.id, nil).nil?, "Private order leaked to a guest")
  check(Invidious::Database::Playlists.occurrence_offset(list.id, 999_i64, first.id, owner.email).nil?, "Missing occurrence resolved")
  check(Invidious::Database::Playlists.occurrence_offset(list.id, second.index, "another0001", owner.email).nil?, "Occurrence accepted another video")
  {"Public", "Unlisted"}.each do |privacy|
    PG_DB.exec("UPDATE playlists SET privacy=$1 WHERE id=$2", privacy, list.id)
    check(Invidious::Database::Playlists.occurrence_offset(list.id, second.index, second.id, nil) == 1, "Readable occurrence cursor was unavailable")
  end
  PG_DB.exec("UPDATE playlists SET privacy='Private' WHERE id=$1", list.id)
  {"index=0&occurrence=#{second.index}" => 1, "index=#{second.index}" => 1, "index=1" => 1, "index=1&occurrence=999" => 1}.each do |query, expected|
    cursor_env = HTTP::Server::Context.new(HTTP::Request.new("GET", "/watch?#{query}"), HTTP::Server::Response.new(IO::Memory.new))
    cursor_env.set "user", owner
    check(Invidious::Frontend::WatchPage.playlist_cursor(cursor_env, list.id, first.id) == expected, "Watch cursor changed an ordinal or stable occurrence")
    check(cursor_env.get?("playlist_occurrence_missing") == true, "Missing occurrence did not retain explicit removed state") if query.ends_with?("occurrence=999")
  end
  puts "Watch occurrence/ordinal resolution, duplicate identity, private visibility and expired-entry fallback passed"

  endpoint = "/api/v1/playlists/#{list.id}"
  {nil, other_sid}.each do |visitor|
    check(security_request("GET", "#{endpoint}?format=html&ui=desktop&occurrence=#{second.index}", visitor).response.status_code == 404, "Desktop queue snapshot bypassed private ownership")
  end
  native = JSON.parse(security_request("GET", endpoint, sid).get("test_result").as(String))
  check(!native.as_h.has_key?("positions") && !native.as_h.has_key?("currentOccurrence"), "Desktop queue fields leaked into the native JSON contract")
  ordinary = JSON.parse(security_request("GET", "#{endpoint}?format=html&index=1", sid).get("test_result").as(String))
  check(ordinary.as_h.keys.sort == %w(currentIndex index nextVideo playlistHtml).sort, "Ordinary HTML queue wire fields changed")
  snapshot = security_request("GET", "#{endpoint}?format=html&ui=desktop&index=0&continuation=#{first.id}&occurrence=#{second.index}", sid)
  check(snapshot.response.status_code == 200 && snapshot.response.headers["Cache-Control"] == "private, no-store", "Desktop queue snapshot is unavailable or cacheable")
  desktop = JSON.parse(snapshot.get("test_result").as(String))
  check(desktop["currentIndex"].as_i == 1 && desktop["currentOccurrence"].as_s == second.index.to_s && !desktop["currentRemoved"].as_bool, "Desktop queue selected the first duplicate instead of its stable occurrence")
  check(desktop["positions"].as_h.keys.sort == [first.index.to_s, second.index.to_s].sort && desktop["positions"][second.index.to_s].as_i == 2 && desktop["total"].as_i == 2, "Desktop queue omitted unloaded canonical positions or rounded an occurrence")
  check(desktop["playlistHtml"].as_s.includes?("data-occurrence=\"#{second.index}\""), "Desktop queue HTML lost occurrence identity")
  missing = JSON.parse(security_request("GET", "#{endpoint}?format=html&ui=desktop&index=1&occurrence=999", sid).get("test_result").as(String))
  check(missing["currentRemoved"].as_bool && missing["currentOccurrence"].as_s == "999" && missing["index"].as_i == 1, "Expired playing occurrence skipped its successor")
  check(security_request("GET", "#{endpoint}?format=html&ui=desktop&occurrence=9223372036854775808", sid).response.status_code == 400, "Out-of-range occurrence was accepted")
  puts "Desktop queue snapshot/private visibility, duplicate cursors, expired successors and unchanged native/ordinary wire fields passed"

  check(Invidious::Database::Playlists.cover_ids(owner.email)[list.id] == first.id, "Batched cover did not use the ordered first occurrence")
  check(Invidious::Database::Playlists.remove_video(list.id, owner.email, first.index) == :ok, "Owner removal failed")
  check(PG_DB.query_one("SELECT index FROM playlists WHERE id=$1", list.id, as: Array(Int64)) == [second.index], "Removing one duplicate removed its other occurrence")
  check(Invidious::Database::Playlists.occurrence_offset(list.id, second.index, second.id, owner.email) == 0, "A surviving duplicate retained a stale cursor after removal")

  length_limit = CONFIG.playlist_length_limit
  CONFIG.playlist_length_limit = 2
  outcomes = Channel(Tuple(Symbol, Int32)).new(2)
  2.times do |i|
    video = first.dup; video.index = 100_i64 + i; video.plid = list.id
    spawn { outcomes.send(Invidious::Database::Playlists.append_video(list.id, owner.email, video)) }
  end
  results = Array.new(2) { outcomes.receive }
  CONFIG.playlist_length_limit = length_limit
  check(results.count { |r| r[0] == :ok } == 1 && results.count { |r| r[0] == :full } == 1, "Concurrent additions bypassed the playlist length limit")
  check(PG_DB.query_one("SELECT video_count FROM playlists WHERE id=$1", list.id, as: Int32) == 2, "Concurrent count differs from occurrences")
  check(PG_DB.query_one("SELECT count(*) FROM playlist_videos WHERE plid=$1", list.id, as: Int64) == 2, "Concurrent additions left an orphan row")
  PG_DB.exec("CREATE FUNCTION reject_library_delete() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''test rollback''; END'")
  PG_DB.exec("CREATE TRIGGER reject_library_delete BEFORE DELETE ON playlists FOR EACH ROW EXECUTE FUNCTION reject_library_delete()")
  must_fail("Delete failure did not surface") { Invidious::Database::Playlists.delete(list.id) }
  check(PG_DB.query_one("SELECT count(*) FROM playlist_videos WHERE plid=$1", list.id, as: Int64) == 2, "Failed playlist deletion lost entries")
  PG_DB.exec("DROP TRIGGER reject_library_delete ON playlists")
  PG_DB.exec("DROP FUNCTION reject_library_delete()")

  create_token = Invidious::Helpers::Tokens.generate_response(sid, {":create_playlist"}, HMAC_KEY)
  fields = {"title" => "Keep my <typed> & quoted draft", "privacy" => "invalid", "csrf_token" => create_token}
  html = security_request("POST", "/create_playlist", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  check(html.response.status_code == 400 && html.get("test_result").as(String).includes?(HTML.escape(fields["title"])) && html.get("test_result").as(String).includes?("data-playlist-form=\"create\""), "Failed HTML creation lost its draft")
  fields["privacy"] = "Private"
  %w(Public Unlisted Private).each do |privacy|
    fields["privacy"] = privacy
    result = security_request("POST", "/create_playlist?redirect=false", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
    check(result.response.status_code == 200, "JSON creation failed for #{privacy}")
    id = JSON.parse(result.get("test_result").as(String))["playlistId"].as_s
    created = Invidious::Database::Playlists.select(id: id).not_nil!
    check(created.title == fields["title"] && created.privacy.to_s == privacy, "Creation did not preserve title/privacy")
    page = security_request("GET", "/playlist?list=#{id}", sid)
    check(page.response.status_code == 200 && !page.response.headers.has_key?("Location"), "Empty playlist redirected instead of rendering")
    if privacy == "Private"
      check(security_request("GET", "/playlist?list=#{id}&page=200", other_sid).response.status_code == 403, "Private page bounds leaked through a redirect")
      check(page.response.headers["Cache-Control"].includes?("no-store"), "Private playlist is cacheable")
    end
  end
  fields["title"] = "日本語" * 30
  check(security_request("POST", "/create_playlist?redirect=false", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code == 400, "Overlong UTF-8 title bypassed validation")
  edit_token = Invidious::Helpers::Tokens.generate_response(sid, {":edit_playlist"}, HMAC_KEY)
  edit_fields = {"title" => "Changed <title>", "privacy" => "Unlisted", "description" => "Keep </textarea> & <script> literally", "csrf_token" => edit_token}
  result = security_request("POST", "/edit_playlist?list=#{list.id}&redirect=false", sid: sid, body: URI::Params.encode(edit_fields), content_type: "application/x-www-form-urlencoded")
  check(result.response.status_code == 200 && JSON.parse(result.get("test_result").as(String))["title"].as_s == edit_fields["title"], "Edit JSON failed to acknowledge canonical metadata")
  edit_fields["privacy"] = "invalid"
  html = security_request("POST", "/edit_playlist?list=#{list.id}", sid: sid, body: URI::Params.encode(edit_fields), content_type: "application/x-www-form-urlencoded")
  check(html.response.status_code == 400 && html.get("test_result").as(String).includes?(HTML.escape(edit_fields["description"])) && !html.get("test_result").as(String).includes?("<script> literally"), "Failed edit did not safely retain its description")
  check(Invidious::Database::Playlists.select(id: list.id).not_nil!.privacy.unlisted?, "Invalid edit changed canonical privacy")
  edit_fields["privacy"] = "Public"
  check(security_request("POST", "/edit_playlist?list=#{list.id}", sid: other_sid, body: URI::Params.encode(edit_fields), content_type: "application/x-www-form-urlencoded").response.status_code >= 400, "Another account edited the playlist")

  before_remove = PG_DB.query_one("SELECT index FROM playlists WHERE id=$1", list.id, as: Array(Int64))
  ajax_token = Invidious::Helpers::Tokens.generate_response(sid, {"POST:playlist_ajax"}, HMAC_KEY)
  removed = security_request("POST", "/playlist_ajax?action=remove_video&redirect=false&playlist_id=#{list.id}&set_video_id=#{before_remove.first}", sid: sid, body: URI::Params.encode({"csrf_token" => ajax_token, "include_positions" => "1"}), content_type: "application/x-www-form-urlencoded")
  check(removed.response.status_code == 200, "Occurrence removal with a canonical snapshot failed")
  canonical = JSON.parse(removed.get("test_result").as(String))
  check(canonical["total"].as_i == 1 && canonical["positions"][before_remove.last.to_s].as_i == 1 && !canonical["positions"].as_h.has_key?(before_remove.first.to_s), "Removal snapshot lost canonical count/order")

  Database::SavedPlaylists.save(other.email, NativePlaylists.metadata(Invidious::Database::Playlists.select(id: list.id).not_nil!, other.email))
  delete_token = Invidious::Helpers::Tokens.generate_response(other_sid, {":delete_playlist"}, HMAC_KEY)
  unsave = {"operation" => "unsave", "csrf_token" => delete_token}
  result = security_request("POST", "/delete_playlist?list=#{list.id}", sid: other_sid, body: URI::Params.encode(unsave), content_type: "application/x-www-form-urlencoded")
  check(result.response.status_code == 302 && !Database::SavedPlaylists.exists?(other.email, list.id), "Unsave did not remove the requesting account's reference")
  check(!Invidious::Database::Playlists.select(id: list.id).nil?, "Unsave deleted the source")
  unsave["operation"] = "delete"
  check(security_request("POST", "/delete_playlist?list=#{list.id}", sid: other_sid, body: URI::Params.encode(unsave), content_type: "application/x-www-form-urlencoded").response.status_code == 403, "Foreign source deletion succeeded")

  PG_DB.exec("UPDATE users SET watched=ARRAY['abcdefghijk'] WHERE email=$1", owner.email)
  PG_DB.exec("INSERT INTO watch_history(email, video_id, latest_watched) VALUES($1, 'abcdefghijk', now())", owner.email)
  Invidious::Database::PlaybackPositions.upsert(owner.email, "abcdefghijk", 5)
  PG_DB.exec("CREATE FUNCTION reject_library_clear() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''test rollback''; END'")
  PG_DB.exec("CREATE TRIGGER reject_library_clear BEFORE DELETE ON playback_positions FOR EACH ROW EXECUTE FUNCTION reject_library_clear()")
  must_fail("Clear-position failure did not surface") { Invidious::Database::Users.clear_watch_history(owner, clear_positions: true) }
  check(PG_DB.query_one("SELECT count(*) FROM watch_history WHERE email=$1", owner.email, as: Int64) == 1 && Invidious::Database::Users.select!(email: owner.email).watched == ["abcdefghijk"], "Failed full-history clearing lost history")
  PG_DB.exec("DROP TRIGGER reject_library_clear ON playback_positions")
  PG_DB.exec("DROP FUNCTION reject_library_clear()")
  clear_token = Invidious::Helpers::Tokens.generate_response(sid, {":clear_watch_history"}, HMAC_KEY)
  result = security_request("POST", "/clear_watch_history", sid: sid, body: URI::Params.encode({"csrf_token" => clear_token}), content_type: "application/x-www-form-urlencoded")
  check(result.response.status_code == 302, "Confirmed history clearing failed")
  check(PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE email=$1", owner.email, as: Int64) == 0 && PG_DB.query_one("SELECT count(*) FROM watch_history WHERE email=$1", owner.email, as: Int64) == 0, "Clearing history left synced positions")
  puts "Library atomic writes/rollback/limits, duplicate occurrences, draft validation, privacy, reference isolation and history clearing passed"
ensure
  CONFIG.login_enabled = enabled unless enabled.nil?
  CONFIG.playlist_length_limit = length_limit unless length_limit.nil?
end

def check_library_limit_race
  sid = Invidious::Database::Accounts.register("LibraryLimit", "a disposable playlist quota password", Preferences.from_json("{}"))
  owner = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(sid).not_nil!)
  utf8 = Invidious::Playlists::Playlists.create_playlist("日" * 51, PlaylistPrivacy::Private, owner)
  check(utf8.title == "日" * 50, "The existing title bound produced invalid UTF-8")
  PG_DB.exec("INSERT INTO playlists SELECT 'Limit', 'IVlimit' || n, $1, '', 0, now(), now(), 'Private'::privacy, '{}'::bigint[] FROM generate_series(1,98) n", owner.email)
  outcomes = Channel(Symbol).new(2)
  2.times do
    spawn do
      begin
        Invidious::Playlists::Playlists.create_playlist("The last slot", PlaylistPrivacy::Private, owner)
        outcomes.send(:ok)
      rescue InfoException
        outcomes.send(:full)
      end
    end
  end
  values = Array.new(2) { outcomes.receive }
  check(values.count(:ok) == 1 && values.count(:full) == 1 && Invidious::Database::Playlists.count_owned_by(owner.email) == 100, "Concurrent creation bypassed the owned-playlist quota")
  puts "Owned-playlist quota concurrency and UTF-8 title boundary passed"
end

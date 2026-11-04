# Retired internal read formats never fall through to settings/watch mutations.
def check_retired_enhancement_routes
  sid = Invidious::Database::Accounts.register("RefreshSettingsOwner", "isolated refresh settings password", Preferences.from_json("{}"))
  owner = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  before = Invidious::Database::Users.select!(email: owner)
  before_positions = PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE email=$1", owner, as: Int64)
  writes_before = DEARROW_TEST_WRITES.size
  [nil, sid].each do |session|
    ["/preferences?format=runtime", "/preferences?section=appearance&format=runtime", "/watch?format=enhancements&v=2isYuQZMbdU"].each do |path|
      response = security_request("GET", path, sid: session)
      check(response.response.status_code == 410 && response.response.headers["Cache-Control"] == "private, no-store", "Retired settings read did not return no-store Gone")
      check(JSON.parse(response.get("test_result").as(String))["error"].as_s.includes?("Reload"), "Retired settings read lost its refresh explanation")
    end
  end
  denied = security_request("POST", "/preferences?format=runtime", sid: sid, body: "dark_mode=dark", content_type: "application/x-www-form-urlencoded")
  check(denied.response.status_code == 405 && denied.response.headers["Allow"] == "GET", "Retired runtime accepted a mutation")
  after = Invidious::Database::Users.select!(email: owner)
  check(before.preferences == after.preferences && before.watched == after.watched && before.notifications == after.notifications, "Retired endpoints changed settings/history/notifications")
  check(PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE email=$1", owner, as: Int64) == before_positions && DEARROW_TEST_WRITES.size == writes_before, "Retired endpoints changed playback/contributions")
  check_member_queue_compatibility(sid, owner, before.preferences.to_json)
end

def check_member_queue_compatibility(sid, owner, original_raw)
  preferences = Preferences.from_json(original_raw)
  channel_a = "UC" + "a" * 22
  preferences.show_original_title = false
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", preferences.to_json, owner)
  user = Invidious::Database::Users.select!(email: owner)
  playlist = Invidious::Playlists::Playlists.create_playlist("Retained member occurrences", PlaylistPrivacy::Private, user)
  occurrences = [9_007_199_254_741_001_i64, 9_007_199_254_741_003_i64]
  occurrences.each do |occurrence|
    item = PlaylistVideo.new({title: "A member occurrence", id: "abcdefghijk", author: "A", ucid: channel_a,
                              length_seconds: 120, published: Time.utc, plid: playlist.id, index: occurrence, live_now: false, members_only: true})
    check(Invidious::Database::Playlists.append_video(playlist.id, owner, item)[0] == :ok, "Member queue setup failed")
  end
  queue_path = "/api/v1/playlists/#{playlist.id}?format=html&index=0"
  desktop = JSON.parse(security_request("GET", queue_path + "&ui=desktop", sid: sid).get("test_result").as(String))
  rows = XML.parse_html(desktop["playlistHtml"].as_s).xpath_nodes("//li[@data-occurrence]")
  check(rows.map(&.["data-occurrence"]) == occurrences.map(&.to_s) && desktop["nextVideo"] == "abcdefghijk", "Desktop membership/manual-block visibility removed or reordered duplicate queue occurrences")
  legacy = JSON.parse(security_request("GET", queue_path, sid: sid).get("test_result").as(String))
  check(XML.parse_html(legacy["playlistHtml"].as_s).xpath_nodes("//li").empty? && legacy["nextVideo"].raw.nil?, "Legacy HTML membership filtering changed")
  native = JSON.parse(security_request("GET", "/api/v1/playlists/#{playlist.id}", sid: sid).get("test_result").as(String))
  check(native["videos"].as_a.size == 2 && !native.as_h.has_key?("positions"), "Desktop queue fix changed native occurrence payloads")
  puts "Desktop member occurrence/native compatibility passed"
ensure
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", original_raw, owner)
end

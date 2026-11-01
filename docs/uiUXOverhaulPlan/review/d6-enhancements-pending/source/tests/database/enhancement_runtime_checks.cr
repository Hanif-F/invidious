# Owner-state reads only. No metadata providers or identity transport participate.
def check_enhancement_runtime_routes
  sid = Invidious::Database::Accounts.register("RuntimeStateOwner", "isolated runtime state password", Preferences.from_json("{}"))
  other_sid = Invidious::Database::Accounts.register("RuntimeStateOther", "isolated runtime state password", Preferences.from_json("{}"))
  owner = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  other = Invidious::Database::SessionIDs.select_email(other_sid).not_nil!
  id, other_id = "UC" + "a" * 22, "UC" + "b" * 22
  secret_name = "RuntimePrivateChannelName"
  secret_value = "RuntimeUnknownPrivateValue"
  raw = JSON.parse(Preferences.from_json("{}").to_json).as_h
  raw["dearrow_enabled"] = JSON::Any.new(true)
  raw["sponsorblock_enabled"] = JSON::Any.new(true)
  raw["ai_filter_enabled"] = JSON::Any.new(true)
  raw["channel_spoiler_settings"] = JSON.parse({id => {name: secret_name, hide_title: true, hide_thumbnail: false, reveal_after_days: 7}}.to_json)
  raw["sponsorblock_channel_overrides"] = JSON.parse({id => {name: secret_name, enabled: false, modes: {"intro" => "manual"}}}.to_json)
  raw["future_native"] = JSON.parse({private_id: secret_value, keep: [1, true]}.to_json)
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", raw.to_json, owner)
  Invidious::Database::BlockedChannels.block(owner, id, secret_name)
  Invidious::Database::BlockedChannels.block(other, other_id, "Other private channel")
  other_before = Invidious::Database::Users.preference_json(other)
  writes_before = DEARROW_TEST_WRITES.size

  response = security_request("GET", "/preferences?format=runtime", sid: sid)
  body = response.get("test_result").as(String)
  snapshot = JSON.parse(body)
  state = snapshot["state"]
  check(response.response.status_code == 200 && response.response.headers["Cache-Control"] == "private, no-store", "Runtime owner read/cache contract failed")
  check(state["version"] == 1 && state["account"] == true && state["profile"] == Invidious::BrowserProfiles.account_scope(owner), "Runtime state has the wrong owner")
  check(state["dearrow"]["enabled"] == true && state["sponsorblock"]["enabled"] == true && state["ai"]["ai_filter_enabled"] == true, "Runtime global switches changed")
  check(state["masking"]["rules"][id] == JSON.parse(%({"hide_title":true,"hide_thumbnail":false,"reveal_after_days":7})), "Runtime masking projection changed")
  check(state["sponsorblock"]["overrides"][id] == JSON.parse(%({"enabled":false,"modes":{"intro":"manual"}})), "Runtime inherited override projection changed")
  check(state["blockedChannels"].as_a.map(&.as_s) == [id], "Runtime read leaked another account's blocks")
  check(snapshot["fingerprint"].as_s.matches?(/\A[a-f0-9]{64}\z/) && snapshot["now"].as_i64 > 1_600_000_000, "Runtime metadata is malformed")
  check(!body.includes?(secret_name) && !body.includes?(secret_value) && !body.includes?("private_id") && !body.includes?("future_native") && !body.includes?(owner), "Runtime projection exposed unrelated/private fields")
  check(!Invidious::Database::DeArrowIdentities.configured?(owner) && DEARROW_TEST_WRITES.size == writes_before, "Runtime read created an identity or contribution")

  prefs = Preferences.from_json(raw.to_json)
  first = Invidious::Frontend::EnhancementState.snapshot(prefs, "guest", true, [other_id, id, id, "invalid"], HMAC_KEY, Time.unix(1_700_000_000))
  later = Invidious::Frontend::EnhancementState.snapshot(prefs, "guest", true, [id, other_id], HMAC_KEY, Time.unix(1_800_000_000))
  check(first[:fingerprint] == later[:fingerprint] && first[:now] != later[:now], "Clock or block order manufactured a runtime configuration change")
  check(first[:state][:browseFingerprint] == later[:state][:browseFingerprint] && first[:state][:historyFingerprint] == later[:state][:historyFingerprint], "Canonical block normalization changed browse/history owner fingerprints")
  one_block = Invidious::Frontend::Misc.browse_fingerprint(prefs, blocked: [id])
  check(one_block != first[:state][:browseFingerprint], "Blocked-channel changes did not invalidate browse owner state")
  presentation = JSON.parse(prefs.to_json).as_h.merge({"dark_mode" => JSON::Any.new("dark"), "speed" => JSON::Any.new(1.75)})
  presented = Preferences.from_json(presentation.to_json)
  check(Invidious::Frontend::Misc.browse_fingerprint(presented, blocked: [id]) == one_block, "Playback/appearance changes invalidated browse owner state")
  zone_changed = Preferences.from_json(presentation.merge({"timezone" => JSON::Any.new(prefs.timezone == "Asia/Jakarta" ? "UTC" : "Asia/Jakarta")}).to_json)
  check(Invidious::Frontend::Misc.browse_fingerprint(zone_changed, blocked: [id]) == one_block, "History-only timezone changes invalidated discovery owner state")
  check(Invidious::Frontend::Misc.browse_fingerprint(zone_changed, history: true, blocked: [id]) != Invidious::Frontend::Misc.browse_fingerprint(prefs, history: true, blocked: [id]), "Timezone changes failed to invalidate history owner state")
  moved_owner = Invidious::Frontend::EnhancementState.snapshot(prefs, Invidious::BrowserProfiles.account_scope(other), true, [id, other_id], HMAC_KEY)
  check(first[:fingerprint] != moved_owner[:fingerprint], "Runtime fingerprint is not owner-bound")

  guest_raw = raw.merge({"dearrow_enabled" => JSON::Any.new(false)}).to_json
  guest_cookie = "PREFS=#{URI.encode_www_form(guest_raw)}"
  guest = security_request("GET", "/preferences?format=runtime", cookies: guest_cookie)
  guest_state = JSON.parse(guest.get("test_result").as(String))["state"]
  check(guest.response.status_code == 200 && guest_state["account"] == false && guest_state["profile"] == "guest" && guest_state["dearrow"]["enabled"] == false, "Runtime guest cookie scope changed")
  check(guest_state["masking"]["rules"].as_h.empty? && guest_state["sponsorblock"]["overrides"].as_h.empty? && guest_state["blockedChannels"].as_a.empty?, "Guest runtime imported account channel state")
  mixed = security_request("GET", "/preferences?format=runtime", sid: sid, cookies: guest_cookie)
  check(JSON.parse(mixed.get("test_result").as(String))["state"]["dearrow"]["enabled"] == true, "Runtime account read imported guest preferences")
  denied = security_request("POST", "/preferences?format=runtime", sid: sid, body: "dark_mode=light", content_type: "application/x-www-form-urlencoded")
  check(denied.response.status_code == 405 && denied.response.headers["Allow"] == "GET", "Runtime check accepted a mutation")
  check(Invidious::Database::Users.preference_json(owner) == raw.to_json && Invidious::Database::Users.preference_json(other) == other_before, "Runtime checks mutated owner/native/other preferences")
  check_watch_enhancement_routes(sid, owner, raw.to_json)

  PG_DB.exec("ALTER TABLE blocked_channels RENAME TO runtime_saved_blocks")
  begin
    unavailable = security_request("GET", "/preferences?format=runtime", sid: sid)
    unavailable_body = JSON.parse(unavailable.get("test_result").as(String))
    check(unavailable.response.status_code == 503 && unavailable_body["state"]?.nil? && unavailable_body["error"].as_s.size > 0, "Unavailable runtime storage appeared as empty rules")
    check(security_request("GET", "/preferences?format=runtime", cookies: guest_cookie).response.status_code == 200, "Guest runtime unnecessarily read account blocks")
  ensure
    PG_DB.exec("ALTER TABLE runtime_saved_blocks RENAME TO blocked_channels")
  end
  puts "Runtime projection owner/guest/native isolation, private-field omission, read-only/cache/fingerprint/time behavior and unavailable-state checks passed"
end

def check_watch_enhancement_routes(sid, owner, original_raw)
  preferences = Preferences.from_json(original_raw)
  preferences.ai_filter_enabled = false
  preferences.show_member_videos = false
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", preferences.to_json, owner)
  channel_a, channel_b, channel_c = {'a', 'b', 'c'}.map { |letter| "UC#{letter.to_s * 22}" }
  video_id = "runtime0001"
  related = [{"id" => "previous001", "title" => "Blocked", "author" => "A", "ucid" => channel_a},
             {"id" => "nextvideo01", "title" => "Member", "author" => "B", "ucid" => channel_b, "members_only" => "true"},
             {"id" => "abcdefghijk", "title" => "Source <title>", "author" => "C", "ucid" => channel_c}]
  info = JSON.parse({title: "Cached source", ucid: channel_a, views: 123, relatedVideos: related}.to_json).as_h
  Invidious::Database::Videos.insert(Video.new({id: video_id, info: info, updated: Time.utc}))
  # Every eligible original is already in the existing cache. A miss test below
  # returns unavailable before any provider/resolver can participate.
  ([video_id] + related.map(&.["id"])).each do |id|
    Invidious::Database::OriginalVideoTitles.save(id, Invidious::OriginalTitles::Entry.new("Original <literal> #{id}", Time.utc + 6.hours))
  end
  fingerprint = Invidious::Frontend::Misc.browse_fingerprint(preferences, blocked: [channel_a])
  path = "/watch?format=enhancements&v=#{video_id}&owner=#{fingerprint}&ids=#{video_id},#{video_id},abcdefghijk&channels=#{channel_a}"
  before_user = Invidious::Database::Users.select!(email: owner)
  positions_before = PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE email=$1", owner, as: Int64)
  response = security_request("GET", path, sid: sid)
  check(response.response.status_code == 200 && response.response.headers["Cache-Control"] == "private, no-store", "Cached watch presentation read/cache contract failed")
  data = JSON.parse(response.get("test_result").as(String))
  document = XML.parse_html(data["recommendations"].as_s)
  check(document.xpath_nodes("//article").map(&.["data-video-id"]) == ["abcdefghijk"] && data["nextVideo"] == "abcdefghijk", "Cached watch membership/manual-block precedence or advancement failed")
  check(data["profile"] == Invidious::BrowserProfiles.account_scope(owner) && data["browseFingerprint"] == fingerprint, "Watch presentation was not bound to the current owner")
  check(data["titles"].as_h.keys.sort == [video_id, "abcdefghijk"].sort && data["titles"][video_id] == "Original <literal> #{video_id}", "Watch presentation lost batched cached original titles")
  check(document.xpath_node("//article//span[@data-title-source]").try(&.["data-title-source"]) == "Source <title>", "Selected originals overwrote the source-title fallback")
  check(data["queueThumbnails"].as_h.empty? && !data.to_json.includes?(owner) && !data.to_json.includes?("RuntimePrivateChannelName"), "Disabled AI/private watch projection changed")
  after_user = Invidious::Database::Users.select!(email: owner)
  check(before_user.watched == after_user.watched && before_user.notifications == after_user.notifications && PG_DB.query_one("SELECT count(*) FROM playback_positions WHERE email=$1", owner, as: Int64) == positions_before, "Watch presentation changed history/notifications/playback positions")
  check(security_request("GET", path.sub(fingerprint, "0" * 64), sid: sid).response.status_code == 409, "Watch presentation accepted a stale owner")
  check(security_request("GET", path.sub("v=#{video_id}", "v=absent00001"), sid: sid).response.status_code == 503, "Watch cache miss did not remain unavailable")
  check(security_request("GET", path + ",invalid", sid: sid).response.status_code == 400, "Watch presentation accepted malformed channel metadata")

  preferences.show_original_title = false
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", preferences.to_json, owner)
  user = Invidious::Database::Users.select!(email: owner)
  playlist = create_playlist("Retained member occurrences", PlaylistPrivacy::Private, user)
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
  puts "Cached watch owner/filter/title/cache/read-only routes and desktop member occurrence/native compatibility passed"
ensure
  PG_DB.exec("UPDATE users SET preferences=$1 WHERE email=$2", original_raw, owner)
end

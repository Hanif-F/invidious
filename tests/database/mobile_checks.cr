def check_mobile_security
  CONFIG.login_enabled = true
  PG_DB.exec("DELETE FROM auth_rate_limits")
  password = "a separate mobile account password"
  store = Invidious::Database::Accounts
  sid = store.register("MobileAlice", password, Preferences.from_json(%({"save_player_pos":true,"theme":"diary"})))
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  login = security_request("POST", "/api/v1/mobile/login", body: {username: "mobilealice", password: password}.to_json)
  check(login.response.status_code == 200, "Native sign-in failed")
  check(login.response.cookies.empty?, "Native sign-in issued a browser cookie")
  check(login.response.headers["Cache-Control"] == "private, no-store", "Native credentials may be cached")
  data = JSON.parse(login.get("test_result").as(String))
  token = data["accessToken"].as_s
  check_mobile_dearrow(token, email, sid)
  check_mobile_sponsorblock(token, email, sid)
  session = JSON.parse(token)["session"].as_s
  check(data["username"] == "MobileAlice", "Native sign-in returned internal account owner")
  check((data["expiresAt"].as_i64 - Time.utc.to_unix - 30.days.total_seconds).abs < 3, "Native lifetime differs from 30 days")
  check(PG_DB.query_one("SELECT expires_at IS NOT NULL FROM session_ids WHERE id = $1", session, as: Bool), "Native database session has no expiry")
  check(security_request("GET", "/api/v1/auth/preferences", bearer: token).response.status_code == 200, "Native scopes reject preferences")
  check(security_request("GET", "/api/v1/auth/tokens", bearer: token).response.status_code == 403, "Native token gained token-manager access")
  expired_signature = JSON.parse(token).as_h
  expired_signature["expire"] = JSON::Any.new(Time.utc.to_unix - 1)
  expired_signature["signature"] = JSON::Any.new(sign_token(HMAC_KEY, expired_signature))
  check(security_request("GET", "/api/v1/auth/preferences", bearer: expired_signature.to_json).response.status_code == 403, "Expired signature survived a valid database session")
  check(!scopes_include_scope(JSON.parse(token)["scopes"].as_a.map(&.as_s), "POST:tokens/register"), "Native token can mint tokens")
  unknown = security_request("POST", "/api/v1/mobile/login", body: {username: "MissingMobile", password: "wrong"}.to_json)
  wrong = security_request("POST", "/api/v1/mobile/login", body: {username: "MobileAlice", password: "wrong"}.to_json)
  check(unknown.response.status_code == 401 && unknown.get("test_result") == wrong.get("test_result"), "Native login reveals account existence")
  check(security_request("POST", "/api/v1/mobile/login", body: "{}").response.status_code == 400, "Malformed native login accepted")
  check(security_request("POST", "/api/v1/mobile/login", body: "x" * 16_385).response.status_code == 400, "Oversized native login accepted")

  stored = JSON.parse(Invidious::Database::Users.preference_json(email)).as_h
  stored["future_setting"] = JSON.parse(%({"untouched":true}))
  PG_DB.exec("UPDATE users SET preferences = $1, watched = ARRAY['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc'] WHERE email = $2", stored.to_json, email)
  Invidious::Database::PlaybackPositions.upsert(email, "aaaaaaaaaaa", 50)
  patch = security_request("PATCH", "/api/v1/auth/preferences", bearer: token, body: %({"save_player_pos":false,"watch_history":false}))
  check(patch.response.status_code == 200, "Native settings merge failed")
  after = JSON.parse(Invidious::Database::Users.preference_json(email)).as_h
  check(after["future_setting"] == stored["future_setting"] && after["theme"] == stored["theme"], "Native settings destroyed unrelated preferences")
  check(Invidious::Database::PlaybackPositions.select_all(email).empty?, "Disabling positions failed to clear saved positions")
  { %({"theme":"dark"}), %({"watch_history":"false"}), "{}" }.each do |invalid|
    check(security_request("PATCH", "/api/v1/auth/preferences", bearer: token, body: invalid).response.status_code == 400, "Invalid preference patch accepted")
    check(JSON.parse(Invidious::Database::Users.preference_json(email)).as_h == after, "Rejected patch changed preferences")
  end
  PG_DB.exec("INSERT INTO watch_history (email, video_id, title, channel_name, length_seconds) VALUES ($1,'bbbbbbbbbbb','Saved title','Saved channel',123)", email)
  legacy = security_request("GET", "/api/v1/auth/history?page=1&max_results=2", bearer: token)
  check(JSON.parse(legacy.get("test_result").as(String)) == JSON.parse(%(["ccccccccccc","bbbbbbbbbbb"])), "Existing history API changed")
  detailed = security_request("GET", "/api/v1/auth/history?details=true&page=1&max_results=2", bearer: token)
  entries = JSON.parse(detailed.get("test_result").as(String)).as_a
  check(entries.size == 2 && entries[0]["video_id"] == "ccccccccccc" && entries[0]["title"]?.nil?, "Unavailable history entry was discarded or reordered")
  check(entries[1]["title"] == "Saved title" && entries[1]["length_seconds"] == 123, "Saved history metadata was lost")
  huge = security_request("GET", "/api/v1/auth/history?details=true&page=2147483647", bearer: token)
  check(JSON.parse(huge.get("test_result").as(String)).as_a.empty?, "Large history pagination overflowed")
  PG_DB.exec("UPDATE session_ids SET expires_at = now() - interval '1 second' WHERE id = $1", session)
  check(security_request("GET", "/api/v1/auth/preferences", bearer: token).response.status_code == 403, "Expired native database session survived")
  fresh = store.authenticate_mobile("MobileAlice", password).not_nil![:accessToken]
  refreshed_sid = store.change(email, sid, password, new_password: "a changed mobile account password").not_nil!
  check(Invidious::Database::SessionIDs.select_email(JSON.parse(fresh)["session"].as_s).nil?, "Credential change did not revoke native token")
  token = store.authenticate_mobile("MobileAlice", "a changed mobile account password").not_nil![:accessToken]
  check(security_request("POST", "/api/v1/auth/tokens/unregister", bearer: token, body: "{}").response.status_code == 204, "Native logout failed")
  check(Invidious::Database::SessionIDs.select_email(JSON.parse(token)["session"].as_s).nil?, "Native logout left token alive")
  11.times { store.throttle("auth-user:ratemobile", 10, 900) }
  limited = security_request("POST", "/api/v1/mobile/login", body: {username: "RateMobile", password: "wrong"}.to_json)
  check(limited.response.status_code == 429 && limited.response.headers["Retry-After"].to_i > 0, "Native login bypassed shared throttle")
  CONFIG.login_enabled = false
  check(security_request("POST", "/api/v1/mobile/login", body: {username: "MobileAlice", password: password}.to_json).response.status_code == 403, "Native sign-in bypassed login switch")
  CONFIG.login_enabled = true
  legacy_sid = store.register("Legacy Mobile !", password, Preferences.from_json("{}"))
  legacy_email = Invidious::Database::SessionIDs.select_email(legacy_sid).not_nil!
  PG_DB.exec("UPDATE users SET password = $1, credential_version = 1 WHERE email = $2", Crypto::Bcrypt::Password.create("old", cost: 4).to_s, legacy_email)
  check(store.authenticate_mobile("legacy mobile !", "old") != nil, "Native login rejected legacy credentials")

  race_sid = store.register("MobileRace", password, Preferences.from_json("{}"))
  race_email = Invidious::Database::SessionIDs.select_email(race_sid).not_nil!
  outcomes = Channel(String?).new(3)
  3.times do
    spawn { outcomes.send(store.authenticate_mobile("MobileRace", password).try(&.[:accessToken])) }
  end
  check(store.change(race_email, race_sid, password, new_password: "a changed racing mobile password") != nil, "Concurrent credential change failed")
  3.times do
    if issued = outcomes.receive
      check(Invidious::Database::SessionIDs.select_email(JSON.parse(issued)["session"].as_s).nil?, "A concurrently issued native token escaped credential revocation")
    end
  end
  puts "Native sign-in, least privilege, expiry, revocation, settings preservation and history API passed"
end

def check_mobile_sponsorblock(token, email, sid)
  path = "/api/v1/auth/preferences"
  id = "UC" + "a" * 22
  other = "UC" + "b" * 22
  stored = JSON.parse(Invidious::Database::Users.preference_json(email)).as_h
  stored["future_sponsorblock_test"] = JSON.parse(%({"keep":true}))
  stored["sponsorblock_channel_overrides"] = JSON.parse({id => {name: "Studio", enabled: false, modes: {intro: "manual"}}, other => {name: "Other", enabled: true, modes: {} of String => String}}.to_json)
  PG_DB.exec("UPDATE users SET preferences = $1 WHERE email = $2", stored.to_json, email)
  patch = {sponsorblock_enabled: true, sponsorblock_modes: {sponsor: "auto"}, sponsorblock_colors: {sponsor: "#123456"},
           sponsorblock_channel_overrides: {id => {enabled: nil, modes: {intro: "marker"}}}}.to_json
  result = security_request("PATCH", path, bearer: token, body: patch)
  check(result.response.status_code == 200, "SponsorBlock patch failed")
  raw = JSON.parse(Invidious::Database::Users.preference_json(email))
  prefs = Preferences.from_json(raw.to_json)
  check(prefs.sponsorblock_enabled && prefs.sponsorblock_modes["sponsor"] == "auto" && prefs.sponsorblock_colors["sponsor"] == "#123456", "Global SponsorBlock values differ")
  check(prefs.sponsorblock_channel_overrides[id].name == "Studio" && prefs.sponsorblock_channel_overrides[id].enabled.nil? && prefs.sponsorblock_channel_overrides[id].modes == {"intro" => "marker"}, "Channel replacement/inheritance failed")
  check(raw["future_sponsorblock_test"]["keep"].as_bool && raw["dearrow_enabled"] == stored["dearrow_enabled"] && raw["theme"] == stored["theme"], "SponsorBlock destroyed unrelated preferences")
  check(prefs.sponsorblock_channel_overrides.has_key?(other), "SponsorBlock lost other channels")
  before = raw.to_json
  { %({"sponsorblock_modes":{"intro":"wrong"}}), %({"sponsorblock_colors":{"intro":"red"}}), %({"sponsorblock_enabled":"true"}), %({"sponsorblock_channel_overrides":{"UCbad":null}}), "x" * 16_385 }.each do |invalid|
    check(security_request("PATCH", path, bearer: token, body: invalid).response.status_code == 400, "Invalid SponsorBlock update accepted")
    check(Invidious::Database::Users.preference_json(email) == before, "Rejected SponsorBlock patch changed settings")
  end
  check(security_request("PATCH", path, body: patch).response.status_code == 403, "Guest SponsorBlock account write accepted")
  check(security_request("PATCH", path, sid, body: patch).response.status_code == 403, "Cookie SponsorBlock write bypassed CSRF")
  # A pre-existing token with the original preference scopes remains sufficient.
  old_token = generate_token(email, ["GET:preferences", "PATCH:preferences"], nil, HMAC_KEY, sid)
  check(security_request("PATCH", path, bearer: old_token, body: %({"sponsorblock_modes":{"intro":"auto"}})).response.status_code == 200, "SponsorBlock required new token permissions")
  csrf = JSON.parse(security_request("GET", "/api/v1/auth/csrf", sid).get("test_result").as(String))["csrfToken"].as_s
  check(security_request("PATCH", path, sid, body: %({"sponsorblock_colors":{"intro":"#abcdef"}}), csrf: csrf).response.status_code == 200, "Valid cookie SponsorBlock write failed")
  signals = Channel(Int32).new(2)
  spawn { signals.send(security_request("PATCH", path, bearer: token, body: %({"sponsorblock_modes":{"outro":"marker"}})).response.status_code) }
  spawn { signals.send(security_request("PATCH", path, bearer: token, body: %({"sponsorblock_colors":{"outro":"#654321"}})).response.status_code) }
  2.times { check(signals.receive == 200, "Concurrent SponsorBlock patch failed") }
  raw = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(raw["sponsorblock_modes"]["outro"].as_s == "marker" && raw["sponsorblock_colors"]["outro"].as_s == "#654321", "Concurrent SponsorBlock delta lost")
  missing = "UC" + "c" * 22
  before = raw.to_json
  check(security_request("PATCH", path, bearer: token, body: {sponsorblock_enabled: false, sponsorblock_channel_overrides: {missing => {enabled: true}}}.to_json).response.status_code == 502, "Channel lookup failure not reported")
  check(Invidious::Database::Users.preference_json(email) == before, "Failed channel lookup partly applied")
  check(security_request("PATCH", path, bearer: token, body: {sponsorblock_channel_overrides: {id => nil}}.to_json).response.status_code == 200, "Channel reset failed")
  prefs = Preferences.from_json(Invidious::Database::Users.preference_json(email))
  check(!prefs.sponsorblock_channel_overrides.has_key?(id) && prefs.sponsorblock_channel_overrides.has_key?(other), "Channel reset changed other channels")
  read = security_request("GET", path, bearer: token)
  check(Preferences.from_json(read.get("test_result").as(String)).sponsorblock_modes == prefs.sponsorblock_modes, "Web/native SponsorBlock preferences differ")
  puts "Native SponsorBlock preferences, inheritance, isolation, scopes, CSRF and concurrent deltas passed"
end

def check_mobile_dearrow(token, email, sid)
  saved_key = CONFIG.dearrow_identity_key
  CONFIG.dearrow_identity_key = "ab" * 32
  path = "/api/v1/auth/dearrow/abcdefghijk"
  identity_path = "/api/v1/auth/dearrow/identity"
  before_writes = DEARROW_TEST_WRITES.size
  before_preferences = Invidious::Database::Users.preference_json(email)
  state = security_request("GET", identity_path, bearer: token)
  check(state.response.status_code == 200 && state.response.headers["Cache-Control"] == "private, no-store", "DeArrow status rejected or cached")
  check(JSON.parse(state.get("test_result").as(String)) == JSON.parse(%({"ready":true,"configured":false})), "Status created or disclosed an identity")
  check(security_request("POST", path, body: %({"action":"submit","title":"Draft","confirmed":true})).response.status_code == 403, "Anonymous contribution accepted")
  old_token = generate_token(email, ["GET:preferences"], nil, HMAC_KEY, sid)
  check(security_request("GET", identity_path, bearer: old_token).response.status_code == 403, "Older token gained DeArrow access")
  check(security_request("PUT", identity_path, sid, body: %({"privateId":""})).response.status_code == 403, "Cookie identity write bypassed CSRF")
  {"{}", %({"privateId":"short"}), %({"privateId":false}), "x" * 16_385}.each do |body|
    check(security_request("PUT", identity_path, bearer: token, body: body).response.status_code == 400, "Malformed private identity accepted")
  end
  imported = "c" * 64
  check(security_request("PUT", identity_path, bearer: token, body: {privateId: imported}.to_json).response.status_code == 200, "Native identity import failed")
  check(security_request("PUT", identity_path, bearer: token, body: %({"privateId":""})).response.status_code == 200, "Blank identity import failed")
  check(Invidious::Database::DeArrowIdentities.identity(email, CONFIG.dearrow_identity_key) == imported, "Blank import replaced identity")
  check(!PG_DB.query_one("SELECT ciphertext FROM dearrow_identities WHERE email = $1", email, as: String).includes?(imported), "Native identity stored plaintext")
  result = security_request("GET", path + "/submissions", bearer: token)
  check(result.response.headers["Cache-Control"] == "private, no-store", "Native submissions may be cached")
  titles = JSON.parse(result.get("test_result").as(String))["titles"].as_a
  check(titles.map { |item| item["UUID"].as_s } == ["original", "proposal", "locked"], "Native title order changed")
  check(!result.get("test_result").as(String).includes?(imported), "Private identity appeared in titles")
  {% for body in ["{}", "{\"action\":\"submit\",\"title\":\"Draft\",\"confirmed\":\"true\"}", "{\"action\":\"submit\",\"title\":\"Draft\",\"confirmed\":false}", "{\"action\":\"upvote\",\"original\":\"true\"}"] %}
    check(security_request("POST", path, bearer: token, body: {{body}}).response.status_code == 400, "Malformed action accepted")
  {% end %}
  check(security_request("POST", path, bearer: token, body: {action: "submit", title: "a" * 111, confirmed: true}.to_json).response.status_code == 400, "Oversized title accepted")
  check(security_request("POST", path, bearer: token, body: {action: "submit", title: "two\nlines", confirmed: true}.to_json).response.status_code == 400, "Multiline title accepted")
  check(security_request("POST", path, bearer: token, body: %({"action":"downvote","uuid":"locked"})).response.status_code == 403, "Locked native vote accepted")
  check(security_request("POST", path, bearer: token, body: %({"action":"upvote","uuid":"gone"})).response.status_code == 409, "Stale native vote accepted")
  check(DEARROW_TEST_WRITES.size == before_writes, "Rejected request wrote upstream")
  check(security_request("POST", path, bearer: token, body: %({"action":"submit","title":"  A clear title  ","confirmed":true})).response.status_code == 200, "Native proposal failed")
  check(security_request("POST", path, bearer: token, body: %({"action":"downvote","uuid":"proposal"})).response.status_code == 200, "Native vote failed")
  check(security_request("POST", path, bearer: token, body: %({"action":"upvote","original":true})).response.status_code == 200, "Original vote failed")
  writes = DEARROW_TEST_WRITES.last(3).map { |body| JSON.parse(body) }
  check(writes.all? { |body| body["userID"].as_s == imported && !body["autoLock"].as_bool && !body["thumbnail"]? }, "Native and web identities/semantics differ")
  check(writes[0]["title"]["title"].as_s == "A clear title" && writes[1]["title"]["title"].as_s == "Exact >proposal" && writes[2]["title"]["original"].as_bool, "Native title resolution changed")
  state = security_request("GET", identity_path, bearer: token).get("test_result").as(String)
  check(!state.includes?(imported) && JSON.parse(state)["configured"].as_bool, "Private ID returned by status")
  check(Invidious::Database::Users.preference_json(email) == before_preferences, "Identity import changed preferences")
  patch = security_request("PATCH", "/api/v1/auth/preferences", bearer: token, body: %({"dearrow_enabled":true,"dearrow_show_original":false}))
  check(patch.response.status_code == 200, "DeArrow preference patch failed")
  prefs = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(prefs["dearrow_enabled"].as_bool && !prefs["dearrow_show_original"].as_bool && prefs["theme"].as_s == "diary" && prefs["save_player_pos"].as_bool, "DeArrow patch lost unrelated settings")
  CONFIG.dearrow_identity_key = ""
  check(security_request("POST", path, bearer: token, body: %({"action":"submit","title":"Draft","confirmed":true})).response.status_code == 503, "Unavailable storage accepted native write")
  check(!JSON.parse(security_request("GET", identity_path, bearer: token).get("test_result").as(String))["ready"].as_bool, "Missing key reported ready")
  CONFIG.dearrow_identity_key = saved_key
  puts "Native DeArrow authentication, shared identity, validation, voting and settings passed"
end

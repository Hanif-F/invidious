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

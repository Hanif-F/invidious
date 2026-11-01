def check_contribution_editor_routes
  before_key = CONFIG.dearrow_identity_key
  CONFIG.dearrow_identity_key = "ab" * 32
  sid = Invidious::Database::Accounts.register("ContributionEditorOwner", "isolated contribution password", Preferences.from_json("{}"))
  other_sid = Invidious::Database::Accounts.register("ContributionEditorOther", "isolated contribution password", Preferences.from_json("{}"))
  owner = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  other = Invidious::Database::SessionIDs.select_email(other_sid).not_nil!
  Invidious::Database::DeArrowIdentities.import(other, "q" * 64, CONFIG.dearrow_identity_key)
  other_before = PG_DB.query_one("SELECT ciphertext FROM dearrow_identities WHERE email=$1", other, as: String)
  prefs = Invidious::Database::Users.preference_json(owner)
  token = generate_response(sid, {"POST:dearrow_submit"}, HMAC_KEY)
  fields = {"video_id" => "abcdefghijk", "action" => "upvote", "uuid" => "proposal", "csrf_token" => token, "browser_profile" => Invidious::BrowserProfiles.account_scope(owner)}
  count = DEARROW_TEST_WRITES.size
  read = security_request("GET", "/api/v1/dearrow/abcdefghijk/submissions", sid: sid)
  check(read.response.status_code == 200 && read.response.headers["Cache-Control"] == "private, no-store" && JSON.parse(read.get("test_result").as(String))["titles"].as_a.size == 3, "Web contribution read/cache contract changed")
  check(!Invidious::Database::DeArrowIdentities.configured?(owner) && DEARROW_TEST_WRITES.size == count, "Read created an identity or contributed")
  check(security_request("GET", "/api/v1/dearrow/abcdefghijk/submissions").response.status_code == 403, "Guest contribution read accepted")
  {"csrf_token" => "invalid", "browser_profile" => Invidious::BrowserProfiles.account_scope(other), "video_id" => "invalid", "uuid" => "missing"}.each do |field, invalid|
    failed = security_request("POST", "/dearrow_submit", sid: sid, body: URI::Params.encode(fields.merge({field => invalid})), content_type: "application/x-www-form-urlencoded")
    check({400, 403, 409}.includes?(failed.response.status_code) && DEARROW_TEST_WRITES.size == count, "Rejected contribution reached upstream")
  end
  check(security_request("POST", "/dearrow_submit", body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded").response.status_code == 403, "Guest contribution accepted")
  check(security_request("POST", "/dearrow_submit", sid: sid, body: URI::Params.encode(fields.merge({"padding" => "x" * 9000})), content_type: "application/x-www-form-urlencoded").response.status_code == 413, "Oversized contribution body accepted")
  {fields.merge({"action" => "downvote", "uuid" => "locked"}), fields.merge({"action" => "submit", "title" => "No confirmation"}), fields.merge({"action" => "submit", "title" => "x" * 111, "confirmed" => "true"})}.each do |body|
    failed = security_request("POST", "/dearrow_submit", sid: sid, body: URI::Params.encode(body), content_type: "application/x-www-form-urlencoded")
    check(failed.response.status_code >= 400 && DEARROW_TEST_WRITES.size == count, "Locked/unacknowledged/invalid title contributed")
  end
  posted = security_request("POST", "/dearrow_submit", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  check(posted.response.status_code == 200 && JSON.parse(posted.get("test_result").as(String)).as_h.keys == ["ok"] && DEARROW_TEST_WRITES.size == count + 1, "Web vote acknowledgement/upstream count changed")
  sent = JSON.parse(DEARROW_TEST_WRITES.last)
  identity = Invidious::Database::DeArrowIdentities.identity(owner, CONFIG.dearrow_identity_key)
  check(sent["title"]["title"] == "Exact >proposal" && sent["userID"] == identity && !posted.get("test_result").as(String).includes?(identity), "Web vote failed exact resolution or private-identity isolation")
  DEARROW_TEST_STATUS[0] = 502
  failed = security_request("POST", "/dearrow_submit", sid: sid, body: URI::Params.encode(fields), content_type: "application/x-www-form-urlencoded")
  check(failed.response.status_code == 502 && DEARROW_TEST_WRITES.size == count + 2 && !failed.get("test_result").as(String).includes?(identity), "Unknown vote was retried or leaked credentials")
  DEARROW_TEST_STATUS[0] = 200
  legacy = fields.reject { |field, _| field == "browser_profile" }
  check(security_request("POST", "/dearrow_submit", sid: sid, body: URI::Params.encode(legacy), content_type: "application/x-www-form-urlencoded").response.status_code == 200, "Old web contribution caller broke")
  check(Invidious::Database::Users.preference_json(owner) == prefs && PG_DB.query_one("SELECT ciphertext FROM dearrow_identities WHERE email=$1", other, as: String) == other_before, "Contribution mutated preferences or another identity")
  puts "Web contribution exact resolution, explicit consent, CSRF/profile/roles, bounded forms, one-attempt unknown outcomes and private/native compatibility checks passed"
ensure
  CONFIG.dearrow_identity_key = before_key if before_key
  DEARROW_TEST_STATUS[0] = 200
end

# Uses the accounts harness's owned, empty PostgreSQL database and real auth.
def check_identity_editor_routes
  path = Invidious::Routes::DeArrowContributions::IDENTITY_PATH
  key_before = CONFIG.dearrow_identity_key
  CONFIG.dearrow_identity_key = "ab" * 32
  sid = Invidious::Database::Accounts.register("IdentityEditorOwner", "isolated identity test password", Preferences.from_json("{}"))
  other_sid = Invidious::Database::Accounts.register("IdentityEditorOther", "isolated identity test password", Preferences.from_json("{}"))
  owner = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  other = Invidious::Database::SessionIDs.select_email(other_sid).not_nil!
  store = Invidious::Database::DeArrowIdentities
  original = "a" * 64
  next_id = "b" * 64
  store.import(other, "c" * 64, CONFIG.dearrow_identity_key)
  other_cipher = PG_DB.query_one("SELECT ciphertext FROM dearrow_identities WHERE email=$1", other, as: String)
  prefs = Invidious::Database::Users.preference_json(owner)
  status = security_request("GET", "#{path}?format=json", sid: sid)
  initial = JSON.parse(status.get("test_result").as(String))
  check(status.response.status_code == 200 && status.response.headers["Cache-Control"] == "private, no-store" && initial["configured"] == false && initial["ready"] == true, "Identity canonical initial state/cache incorrect")
  check(initial.as_h.keys.sort == %w(configured csrf profile ready revision), "Identity metadata has extra fields")
  check(initial["revision"].as_s.size == 64 && !status.get("test_result").as(String).includes?(owner), "Identity metadata exposed account/private data")
  check(security_request("GET", path).response.headers["Location"] == "/login?referer=%2Fpreferences%2Fdearrow%2Fidentity", "Guest identity page bypassed sign-in")
  check(security_request("GET", "#{path}?format=json").response.status_code == 403, "Guest identity metadata accepted")
  body = {"identity_editor" => "1", "private_id" => original, "revision" => initial["revision"].as_s, "browser_profile" => initial["profile"].as_s, "csrf_token" => initial["csrf"].as_s}
  post = security_request("POST", "/dearrow_identity?format=json", sid: sid, body: URI::Params.encode(body), content_type: "application/x-www-form-urlencoded")
  saved = JSON.parse(post.get("test_result").as(String))
  check(post.response.status_code == 200 && saved["imported"] == true && saved["state"]["configured"] == true && saved["state"]["revision"] != initial["revision"], "Identity canonical import failed")
  check(!post.get("test_result").as(String).includes?(original) && store.identity(owner, CONFIG.dearrow_identity_key) == original, "Identity import leaked or lost private ID")
  revision = saved["state"]["revision"].as_s
  body["private_id"] = next_id
  body["revision"] = revision
  check(security_request("POST", "/dearrow_identity?format=json", sid: sid, body: URI::Params.encode(body), content_type: "application/x-www-form-urlencoded").response.status_code == 400, "Identity replacement lacked explicit confirmation")
  body["confirm_replace"] = "on"
  {"csrf_token" => "expired", "browser_profile" => Invidious::BrowserProfiles.account_scope(other), "revision" => initial["revision"].as_s, "private_id" => "<invalid-private-id>"}.each do |field, bad|
    rejected = security_request("POST", "/dearrow_identity?format=json", sid: sid, body: URI::Params.encode(body.merge({field => bad})), content_type: "application/x-www-form-urlencoded")
    check({400, 403, 409}.includes?(rejected.response.status_code) && store.identity(owner, CONFIG.dearrow_identity_key) == original, "Invalid/session/stale identity import mutated storage")
    check(!rejected.get("test_result").as(String).includes?(next_id) && !rejected.get("test_result").as(String).includes?(bad), "Identity failure echoed credential data") if field == "private_id"
  end
  failed = security_request("POST", "/dearrow_identity", sid: sid, body: URI::Params.encode(body.merge({"csrf_token" => "expired"})), content_type: "application/x-www-form-urlencoded")
  html = XML.parse_html(failed.get("test_result").as(String))
  check(failed.response.status_code == 403 && html.xpath_nodes("//*[@id='identity-status'][@role='alert']").size == 1 && html.xpath_nodes("//*[@id='identity-private-id'][@value]").empty?, "Ordinary identity failure lacks safe editor/empty credential")
  check(!failed.get("test_result").as(String).includes?(next_id) && failed.get("test_result").as(String).includes?("Re-enter"), "Ordinary failed identity was echoed or recovery missing")
  # A native write changes the opaque web revision; an old web tab cannot replace it.
  store.import(owner, "d" * 64, CONFIG.dearrow_identity_key)
  conflict = security_request("POST", "/dearrow_identity?format=json", sid: sid, body: URI::Params.encode(body), content_type: "application/x-www-form-urlencoded")
  check(conflict.response.status_code == 409 && store.identity(owner, CONFIG.dearrow_identity_key) == "d" * 64, "Stale web import replaced latest native identity")
  fresh = JSON.parse(security_request("GET", "#{path}?format=json", sid: sid).get("test_result").as(String))
  body["revision"] = fresh["revision"].as_s
  PG_DB.exec("CREATE FUNCTION identity_test_failure() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''isolated identity failure''; END'")
  PG_DB.exec("CREATE TRIGGER identity_test_failure BEFORE UPDATE ON dearrow_identities FOR EACH ROW EXECUTE FUNCTION identity_test_failure()")
  begin
    uncertain = security_request("POST", "/dearrow_identity", sid: sid, body: URI::Params.encode(body), content_type: "application/x-www-form-urlencoded")
    html = XML.parse_html(uncertain.get("test_result").as(String))
    check(uncertain.response.status_code == 503 && html.xpath_nodes("//*[@id='identity-private-id'][@disabled]").size == 1 && !uncertain.get("test_result").as(String).includes?(next_id), "Uncertain identity failure allowed another import or leaked ID")
  ensure
    PG_DB.exec("DROP TRIGGER identity_test_failure ON dearrow_identities")
    PG_DB.exec("DROP FUNCTION identity_test_failure()")
  end
  # Two web tabs starting at one revision have exactly one successful writer.
  shared = store.snapshot(owner, HMAC_KEY)[:revision]
  started = Channel(Nil).new(2)
  go = Channel(Nil).new(2)
  outcomes = Channel(String).new(2)
  {"e" * 64, "f" * 64}.each do |id|
    spawn do
      started.send(nil); go.receive
      begin
        store.import_if_current(owner, id, CONFIG.dearrow_identity_key, shared, HMAC_KEY)
        outcomes.send("saved")
      rescue Invidious::Database::DeArrowIdentities::StaleIdentity
        outcomes.send("stale")
      rescue ex
        outcomes.send("error:" + ex.class.name)
      end
    end
  end
  2.times { started.receive }; 2.times { go.send(nil) }
  check(Array.new(2) { outcomes.receive }.sort == %w(saved stale), "Concurrent identity writers both committed or deadlocked")
  check(store.identity(owner, CONFIG.dearrow_identity_key).in?({"e" * 64, "f" * 64}), "Concurrent identity winner lost")
  # Older web callers and native import/status remain compatible, without new metadata fields.
  legacy = body.reject { |field, _| {"identity_editor", "revision", "browser_profile", "confirm_replace"}.includes?(field) }
  legacy["private_id"] = ""
  old = security_request("POST", "/dearrow_identity", sid: sid, body: URI::Params.encode(legacy), content_type: "application/x-www-form-urlencoded")
  check(old.response.status_code == 302 && old.response.headers["Location"] == "#{path}?saved=1", "Legacy blank identity import changed response contract")
  native = security_request("GET", "/api/v1/auth/dearrow/identity", sid: sid)
  check(JSON.parse(native.get("test_result").as(String)).as_h.keys.sort == %w(configured ready), "Native identity status wire changed")
  check(Invidious::Database::Users.preference_json(owner) == prefs && PG_DB.query_one("SELECT ciphertext FROM dearrow_identities WHERE email=$1", other, as: String) == other_cipher, "Identity editor changed preferences or another account")
  CONFIG.dearrow_identity_key = ""
  setup = security_request("GET", "#{path}?format=json", sid: sid)
  check(JSON.parse(setup.get("test_result").as(String))["ready"] == false, "Missing identity key was reported ready")
  check(security_request("POST", "/dearrow_identity?format=json", sid: sid, body: URI::Params.encode(body), content_type: "application/x-www-form-urlencoded").response.status_code == 503, "Unconfigured identity storage accepted import")
  PG_DB.exec("ALTER TABLE dearrow_identities RENAME TO identity_test_saved")
  begin
    unavailable = security_request("GET", path, sid: sid)
    check(unavailable.response.status_code == 503 && !unavailable.get("test_result").as(String).includes?(%(<p id="identity-current" role="status">An identity will be created)), "Unavailable identity status claimed no identity")
  ensure
    PG_DB.exec("ALTER TABLE identity_test_saved RENAME TO dearrow_identities")
  end
  puts "DeArrow identity web/native privacy, CSRF/profile/revision/confirmation, conditional concurrent imports, uncertain/unavailable storage and ordinary forms passed"
ensure
  CONFIG.dearrow_identity_key = key_before if key_before
end

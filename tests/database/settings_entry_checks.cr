# Runs under the accounts harness's disposable database/authentication guards.
def check_settings_entry_routes(sid, owner)
  before = Invidious::Database::Users.preference_json(owner)
  {nil, sid}.each do |session|
    response = security_request("GET", "/preferences?referer=https%3A%2F%2Foutside.invalid", sid: session)
    html = response.get("test_result").as(String)
    check(response.response.status_code == 200 && response.response.headers["Cache-Control"] == "private, no-store" && !response.response.headers.has_key?("Location"), "Default Settings navigation/cache contract failed")
    check(html.includes?("data-settings-panel") && html.includes?("data-settings-legacy-entry") && html.includes?(%(name="section" value="appearance")), "Default route did not open the real appearance category")
    check(!html.includes?("preferences-form") && !html.includes?(%(name="private_id")) && !html.includes?(%(name="ui_density")) && !html.includes?(%(name="thin_mode")), "Default route exposed legacy/credential controls")
    canonical = security_request("GET", "/preferences?format=json", sid: session)
    data = JSON.parse(canonical.get("test_result").as(String))
    check(canonical.response.status_code == 200 && data["section"] == "appearance" && data["values"].as_h.keys.sort == ["dark_mode", "show_nick"], "Default canonical read returned unrelated preferences")
    check(data["fingerprint"].as_s.size == 64 && data["browseFingerprint"].as_s.size == 64, "Legacy receipt read-back metadata is absent")
  end
  check(security_request("GET", "/preferences?section=unrecognized", sid: sid).response.status_code == 400, "Unknown category became a legacy redirect")
  explicit = security_request("GET", "/preferences?section=playback", sid: sid)
  check(!explicit.get("test_result").as(String).includes?("data-settings-legacy-entry"), "Explicit categories unexpectedly included legacy entry handling")
  check(Invidious::Database::Users.preference_json(owner) == before, "Settings entry read mutated saved native/unknown preferences")
  csrf = generate_response(sid, {"POST:preferences"}, HMAC_KEY)
  receipt = security_request("POST", "/preferences?redirect=false", sid: sid, body: URI::Params.encode({"csrf_token" => csrf, "dark_mode" => "light"}), content_type: "application/x-www-form-urlencoded")
  checked = security_request("GET", "/preferences?section=appearance&format=json", sid: sid)
  check(JSON.parse(receipt.get("test_result").as(String))["fingerprint"] == JSON.parse(checked.get("test_result").as(String))["fingerprint"], "Legacy receipt cannot be checked after the category migration")
  guest = security_request("POST", "/preferences?redirect=false", body: "dark_mode=dark", content_type: "application/x-www-form-urlencoded")
  guest_read = security_request("GET", "/preferences?section=appearance&format=json", cookies: "PREFS=#{guest.response.cookies["PREFS"].value}")
  check(JSON.parse(guest.get("test_result").as(String))["fingerprint"] == JSON.parse(guest_read.get("test_result").as(String))["fingerprint"], "Actual guest cookie cannot attest the legacy receipt")
  puts "Default category/legacy anchor entry, no-store, guest/account, canonical reads, safe referer and read-only preference preservation passed"
end

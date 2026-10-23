def check_mobile_channel_spoilers(token, email, sid)
  original = Invidious::Database::Users.preference_json(email)
  path = "/api/v1/auth/preferences"
  id = "UC" + "a" * 22
  other = "UC" + "b" * 22
  raw = JSON.parse(original).as_h
  raw["channel_spoiler_settings"] = JSON.parse({id => {name: "Studio", hide_title: true, hide_thumbnail: true, reveal_after_days: 7}, other => {name: "Other", hide_title: true, hide_thumbnail: false}}.to_json)
  raw["future_spoiler_test"] = JSON.parse(%({"keep":true}))
  Preferences::RETIRED_THEME_FIELDS.each { |key| raw[key] = JSON::Any.new("legacy") }
  PG_DB.exec("UPDATE users SET preferences = $1 WHERE email = $2", raw.to_json, email)
  delta = {id => {hide_title: false, hide_thumbnail: true, reveal_after_days: nil}}
  result = security_request("PATCH", path, bearer: token, body: {channel_spoiler_settings: delta}.to_json)
  check(result.response.status_code == 200, "Native channel rule rejected existing preference scope")
  saved = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(Preferences::RETIRED_THEME_FIELDS.none? { |key| saved.as_h.has_key?(key) }, "Channel sparse save retained obsolete theme fields")
  check(saved["channel_spoiler_settings"][id]["name"] == "Studio", "Native rule lost server channel name")
  check(saved["channel_spoiler_settings"][other]["hide_title"].as_bool && saved["future_spoiler_test"]["keep"].as_bool, "Native rule replaced unrelated preferences")
  check(saved["channel_spoiler_settings"][id]["reveal_after_days"].raw.nil?, "Blank delay did not serialize null")
  check(Invidious::Database::Users.select!(email: email).preferences.channel_spoiler_settings[id].hide_thumbnail, "Native rule not visible to website")
  invalid = {id => {hide_title: true, hide_thumbnail: false, reveal_after_days: 0}}
  check(security_request("PATCH", path, bearer: token, body: {speed: 1.25, channel_spoiler_settings: invalid}.to_json).response.status_code == 400, "Invalid native rule accepted")
  check(JSON.parse(Invidious::Database::Users.preference_json(email)) == saved, "Rejected rule partially saved preferences")
  check(security_request("PATCH", path, sid: sid, body: {channel_spoiler_settings: delta}.to_json).response.status_code == 403, "Channel rule bypassed browser CSRF")
  completed = Channel(Nil).new(2)
  {id, other}.each do |channel|
    spawn do
      body = {channel_spoiler_settings: {channel => {hide_title: true, hide_thumbnail: false, reveal_after_days: 3}}}.to_json
      check(security_request("PATCH", path, bearer: token, body: body).response.status_code == 200, "Concurrent native rule failed")
      completed.send(nil)
    end
  end
  2.times { completed.receive }
  shared = JSON.parse(security_request("GET", path, bearer: token).get("test_result").as(String))
  check({id, other}.all? { |channel| shared["channel_spoiler_settings"][channel]["reveal_after_days"] == 3 }, "Concurrent channel deltas overwrote each other")
  check(security_request("PATCH", path, bearer: token, body: {channel_spoiler_settings: {id => nil}}.to_json).response.status_code == 200, "Native reset failed")
  check(!Invidious::Database::Users.select!(email: email).preferences.channel_spoiler_settings.has_key?(id), "Native reset kept channel")

  video_id = "spoiler0001"
  PG_DB.exec("INSERT INTO videos VALUES ($1, $2, now())", video_id, %({"publishedIsKnown":true,"sourcePublished":"2026-10-01T12:30:00+07:00"}))
  endpoint = "/api/v1/spoilers/publications?ids=#{video_id},missing0001"
  dates = security_request("GET", endpoint)
  check(dates.response.status_code == 200, "Public cache publication read failed")
  publications = JSON.parse(dates.get("test_result").as(String))["publications"]
  check(publications[video_id].as_i64 == Time.utc(2026, 10, 1, 5, 30).to_unix && publications["missing0001"].raw.nil?, "Cache dates lost precision or synthesized a miss")
  check(security_request("GET", "/api/v1/spoilers/publications?ids=bad").response.status_code == 400, "Invalid cache IDs accepted")
  check(security_request("GET", endpoint, bearer: token).get("test_result") == dates.get("test_result"), "Cache dates depend on account rules")
  PG_DB.exec("DELETE FROM videos WHERE id = $1", video_id)
  puts "Native channel rules, atomic rejection, concurrency, scopes, CSRF and cache-only publication dates passed"
ensure
  PG_DB.exec("UPDATE users SET preferences = $1 WHERE email = $2", original, email) if original
end

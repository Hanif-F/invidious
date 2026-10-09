private class AiNativeStorage < Invidious::AiSList::Storage
  def load_lists : Hash(String, Tuple(String, Time))
    {} of String => Tuple(String, Time)
  end

  def save_list(kind : String, body : String, updated_at : Time) : Nil; end

  def load_handles(ids : Array(String)) : Hash(String, Invidious::AiSList::HandleEntry)
    {} of String => Invidious::AiSList::HandleEntry
  end

  def save_handles(entries : Hash(String, Invidious::AiSList::HandleEntry)) : Nil; end
end

module Invidious::AiSList
  def self.native_fixture_runtime=(runtime : Runtime)
    @@runtime_mutex.synchronize { @@runtime = runtime }
  end
end

def check_mobile_ai(token, email, sid)
  original = Invidious::Database::Users.preference_json(email)
  previous_runtime = Invidious::AiSList.runtime
  path = "/api/v1/auth/preferences"
  legacy = JSON.parse(original).as_h
  (["ai_filter_enabled"] + Invidious::NativePreferences::AI_ACTIONS).each { |key| legacy.delete(key) }
  legacy["ai_blocklist_feeds"] = JSON::Any.new(true)
  legacy["ai_blocklist_action"] = JSON::Any.new("replace_thumbnail")
  legacy["future_ai_test"] = JSON.parse(%({"keep":true}))
  PG_DB.exec("UPDATE users SET preferences = $1 WHERE email = $2", legacy.to_json, email)
  result = security_request("PATCH", path, bearer: token, body: %({"ai_warnlist_search_action":"hide"}))
  check(result.response.status_code == 200, "Native AI preference patch failed")
  saved = JSON.parse(Invidious::Database::Users.preference_json(email))
  check(saved["ai_filter_enabled"].as_bool, "Inferred AI master switch changed during sparse edit")
  check(saved["ai_blocklist_feeds_action"] == "replace_thumbnail", "Native edit lost legacy page choice")
  check(saved["future_ai_test"]["keep"].as_bool, "AI patch destroyed unknown preferences")
  check(Invidious::NativePreferences::AI_ACTIONS.all? { |key| saved.as_h.has_key?(key) }, "AI save did not canonicalize all actions")
  [%({"ai_filter_enabled":"false"}), %({"ai_blocklist_other_pages_action":"hide","speed":1.25}), %({"ai_warnlist_search_action":null})].each do |body|
    check(security_request("PATCH", path, bearer: token, body: body).response.status_code == 400, "Invalid AI preference patch accepted")
    check(JSON.parse(Invidious::Database::Users.preference_json(email)) == saved, "Rejected AI patch partly changed preferences")
  end
  completed = Channel(Nil).new(2)
  [%({"ai_filter_enabled":false}), %({"ai_blocklist_recommendations_action":"replace_thumbnail"})].each do |body|
    spawn do
      check(security_request("PATCH", path, bearer: token, body: body).response.status_code == 200, "Concurrent AI patch failed")
      completed.send(nil)
    end
  end
  2.times { completed.receive }
  read = JSON.parse(security_request("GET", path, bearer: token).get("test_result").as(String))
  check(!read["ai_filter_enabled"].as_bool && read["ai_warnlist_search_action"] == "hide" && read["ai_blocklist_recommendations_action"] == "replace_thumbnail", "Concurrent AI patches overwrote independent choices")
  check(Invidious::Database::Users.select!(email: email).preferences.ai_blocklist_recommendations_action == "replace_thumbnail", "Native AI settings are not visible to the website")
  check(security_request("PATCH", path, sid: sid, body: %({"ai_filter_enabled":true})).response.status_code == 403, "AI patch bypassed browser CSRF")

  storage = AiNativeStorage.new
  id = "UC#{"a" * 22}"
  lists = Invidious::AiSList::Lists.new(storage, ->(kind : String) { kind == "blocklist" ? "#{id}\n" : "@warning\n" })
  lists.refresh
  resolver = Invidious::AiSList::Resolver.new(storage, ->(_id : String) { raise "Unexpected upstream request"; nil.as(String?) })
  resolver.observe({id => "@warning"})
  Invidious::AiSList.native_fixture_runtime = Invidious::AiSList::Runtime.new(lists, resolver)
  status = security_request("GET", "/api/v1/ai/status")
  check(status.response.status_code == 200 && JSON.parse(status.get("test_result").as(String))["lists"]["blocklist"]["channelCount"].as_i == 1, "Public AI status failed")
  endpoint = "/api/v1/ai/channels?ids=#{id}&lists=blocklist,warnlist"
  guest = security_request("GET", endpoint)
  account = security_request("GET", endpoint, sid: sid)
  check(guest.response.status_code == 200 && guest.get("test_result") == account.get("test_result"), "AI classifications depend on account preferences")
  channel = JSON.parse(guest.get("test_result").as(String))["channels"][id]
  check(channel["matches"].as_a.map(&.as_s) == %w(blocklist warnlist) && channel["resolved"].as_bool, "AI route did not return shared matches")
  ["ids=bad&lists=blocklist", "ids=#{id}&lists=unknown", "ids=#{id}", "lists=warnlist"].each do |query|
    check(security_request("GET", "/api/v1/ai/channels?#{query}").response.status_code == 400, "AI route accepted invalid query")
  end
  puts "Native AI API, legacy canonicalization, shared reads, concurrent sparse edits, atomic rejection and CSRF passed"
ensure
  PG_DB.exec("UPDATE users SET preferences = $1 WHERE email = $2", original, email) if original
  Invidious::AiSList.native_fixture_runtime = previous_runtime if previous_runtime
end

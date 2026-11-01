# Runs only inside accounts.cr's guarded disposable PostgreSQL database.
def check_upstream_history_imports_and_feeds
  prefs = Preferences.from_json(%({"save_player_pos":true,"preferred_audio":"id","seek_seconds":20,"dark_mode":"dark"}))
  sid = Invidious::Database::Accounts.register("UpstreamMerge", "a separate upstream regression password", prefs)
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  token = Invidious::Helpers::Tokens.generate_token(email, ["POST:import/invidious"], nil, HMAC_KEY, sid)
  ids = %w[mergevideo1 mergevideo2 mergevideo3]
  payload = {
    watch_history:         [ids[0], ids[1], ids[0]],
    watch_history_details: [{video_id: ids[0], title: "Imported detail", latest_watched: "2026-10-01"}],
    playback_positions:    [{video_id: ids[0], position: 42, updated_at: Time.utc.to_unix}],
    preferences:           JSON.parse(prefs.to_json),
  }.to_json
  response = security_request("POST", "/api/v1/auth/import/invidious", bearer: token, body: payload)
  check(response.response.status_code == 204, "Valid upstream history import failed")
  user = Invidious::Database::Users.select!(email: email)
  check(user.watched == [ids[1], ids[0]], "Imported history lost recency/deduplication")
  check(user.preferences.preferred_audio == "id" && user.preferences.seek_seconds == 20 && user.preferences.dark_mode == "dark", "Import lost fork preferences")
  check(Invidious::Database::PlaybackPositions.select(email, ids[0]).not_nil![:position_seconds] == 42, "Import lost playback progress")
  check(PG_DB.query_one("SELECT title FROM watch_history WHERE email=$1 AND video_id=$2", email, ids[0], as: String) == "Imported detail", "Import lost detailed history")

  before = user.watched
  ["short", "invalid'watch", "abcdefghijk\n"].each do |invalid|
    body = {watch_history: [ids[2], invalid], preferences: {dark_mode: "light"}}.to_json
    response = security_request("POST", "/api/v1/auth/import/invidious", bearer: token, body: body)
    check(response.response.status_code == 400, "Invalid imported video ID did not return 400")
    saved = Invidious::Database::Users.select!(email: email)
    check(saved.watched == before && saved.preferences.dark_mode == "dark", "Invalid history changed history or preferences")
  end
  response = security_request("POST", "/api/v1/auth/import/invidious", bearer: token, body: "{broken")
  check(response.response.status_code == 500, "Unexpected import failure did not return the upstream error response")
  check(response.response.headers["Cache-Control"] == "private, no-store", "Import error was cacheable")

  channels = ["UC" + "7" * 22, "UC" + "8" * 22]
  PG_DB.exec("UPDATE users SET subscriptions=$1 WHERE email=$2", channels, email)
  ids.each_with_index do |id, index|
    PG_DB.exec(<<-SQL, id, Time.utc - index.hours, index < 2 ? channels[0] : channels[1])
      INSERT INTO channel_videos(id,title,published,updated,ucid,author,length_seconds,live_now,views,members_only)
      VALUES ($1,'Merged video',$2,now(),$3,'Merge channel',123,false,0,false)
      SQL
  end
  PG_DB.exec("REFRESH MATERIALIZED VIEW subscriptions_#{sha256(email)}")
  user = Invidious::Database::Users.select!(email: email)
  prefs = user.preferences
  prefs.unseen_only = true
  prefs.notifications_only = false
  prefs.sort = "published"
  {false, true}.each do |latest|
    prefs.latest_only = latest
    user.preferences = prefs
    user.watched = [] of String
    videos, _ = Invidious::User::Users.get_subscription_feed(user)
    check(videos.map(&.id) == (latest ? [ids[0], ids[2]] : ids), "Empty watched array broke subscription filtering")
    user.watched = [ids[0]]
    videos, _ = Invidious::User::Users.get_subscription_feed(user)
    check(videos.map(&.id) == [ids[1], ids[2]], "Watched videos were not excluded")
    user.watched = ["invalid'watch"]
    videos, _ = Invidious::User::Users.get_subscription_feed(user)
    check(videos.map(&.id) == (latest ? [ids[0], ids[2]] : ids), "Legacy malformed watched data was interpolated into SQL")
  end
  prefs.latest_only = false
  user.preferences = prefs
  user.watched = [ids[0]]
  first, _ = Invidious::User::Users.get_subscription_feed(user, 1, 1)
  second, _ = Invidious::User::Users.get_subscription_feed(user, 1, 2)
  check(first.map(&.id) == [ids[1]] && second.map(&.id) == [ids[2]], "Subscription pagination bindings changed")
  check(Invidious::Database::Users.select!(email: email).watched == before, "Subscription filtering wrote history")
  view = Invidious::Frontend::SubscriptionFeed.preferences(user.preferences, URI::Params{"notifications_only" => "1"}, true)
  empty, notices = Invidious::User::Users.get_subscription_feed(user, 20, 1, view)
  check(empty.empty? && notices.empty?, "Empty notifications-only view fell through to ordinary uploads")
  stored = PG_DB.query_one("SELECT preferences FROM users WHERE email=$1", email, as: String)
  page = security_request("GET", "/feed/subscriptions?latest_only=1&unseen_only=0&notifications_only=0&sort=alphabetically", sid)
  check(page.response.status_code == 200, "Explicit feed view failed")
  check(PG_DB.query_one("SELECT preferences FROM users WHERE email=$1", email, as: String) == stored, "Feed view choices rewrote account defaults")
  legacy = Preferences.from_json(%({"quality":"hd720","comments":["reddit",""],"preferred_audio":"id"}))
  check(legacy.quality == "medium" && legacy.comments == ["youtube", ""] && legacy.preferred_audio == "id", "Legacy preferences did not normalize without losing fork fields")
  configured = ConfigPreferences.from_yaml("quality: hd720\ncomments: [reddit, '']\n")
  check(configured.quality == "medium" && configured.comments == ["youtube", ""], "Legacy configuration preferences did not normalize")
  check(Preferences.from_yaml(legacy.to_yaml).comments == ["youtube", ""], "Normalized preferences failed YAML round trip")

  Invidious::Database::ChatTimingOffsets.upsert(email, ids[0], 1250)
  %w(json rss newpipe opml newpipe_json).each do |format|
    exported = security_request("GET", "/subscription_manager?action_takeout=1&format=#{format}", sid)
    check(exported.response.status_code == 200, "Merged export failed: #{format}")
    check(exported.response.headers["Cache-Control"] == "private, no-store", "Merged export was cacheable")
    check(exported.response.headers["Content-Disposition"].starts_with?("attachment; filename="), "Merged export lost attachment filename")
    output = exported.get("test_result").as(String)
    if format == "json"
      data = JSON.parse(output)
      check(data["watch_history"].as_a.map(&.as_s) == before, "Account backup lost watched IDs")
      check(data["watch_history_details"].as_a.any? { |item| item["title"] == "Imported detail" }, "Account backup lost detailed history")
      check(data["playback_positions"].as_a.any? { |item| item["video_id"] == ids[0] && item["position"] == 42 && item["updated_at"].as_i64 > 0 }, "Account backup lost playback progress")
      check(data["chat_timing_offsets"].as_a.any? { |item| item["video_id"] == ids[0] && item["offset_ms"] == 1250 }, "Account backup lost chat timing")
      check(data["preferences"]["preferred_audio"] == "id", "Account backup lost fork preferences")
    elsif format == "newpipe_json"
      data = JSON.parse(output)
      check(data["app_version"].as_s != "" && data["app_version_int"].as_i > 0, "NewPipe export lost application metadata")
      entries = data["subscriptions"].as_a
      check(entries.size == channels.size && entries.map { |item| item["url"].as_s }.sort == channels.map { |id| "https://www.youtube.com/channel/#{id}" }.sort, "NewPipe export lost uncached subscriptions")
      check(entries.all? { |item| item["service_id"] == 0 && !item["name"].as_s.empty? }, "NewPipe export lost provider/name fields")
    else
      entries = XML.parse(output).xpath_nodes("/opml/body/outline/outline")
      check(entries.size == channels.size, "OPML export lost uncached subscriptions")
      prefix = format == "rss" ? HOST_URL : "https://www.youtube.com/"
      check(entries.all? { |item| item["xmlUrl"].starts_with?(prefix) }, "Merged OPML changed existing source URL semantics")
    end
  end
  retired = security_request("GET", "/api/v1/comments/mergevideo1?source=reddit", sid)
  check(retired.response.status_code == 410 && JSON.parse(retired.get("test_result").as(String))["error"].as_s.includes?("Reddit"), "Retired Reddit comment API did not return 410")
  puts "Upstream import ID validation/error statuses, fork import preservation and parameterized subscription filters passed"
end

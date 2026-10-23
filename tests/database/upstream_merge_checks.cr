# Runs only inside accounts.cr's guarded disposable PostgreSQL database.
def check_upstream_history_imports_and_feeds
  prefs = Preferences.from_json(%({"save_player_pos":true,"preferred_audio":"id","seek_seconds":20,"dark_mode":"dark"}))
  sid = Invidious::Database::Accounts.register("UpstreamMerge", "a separate upstream regression password", prefs)
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  token = generate_token(email, ["POST:import/invidious"], nil, HMAC_KEY, sid)
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
    videos, _ = get_subscription_feed(user)
    check(videos.map(&.id) == (latest ? [ids[0], ids[2]] : ids), "Empty watched array broke subscription filtering")
    user.watched = [ids[0]]
    videos, _ = get_subscription_feed(user)
    check(videos.map(&.id) == [ids[1], ids[2]], "Watched videos were not excluded")
    user.watched = ["invalid'watch"]
    videos, _ = get_subscription_feed(user)
    check(videos.map(&.id) == (latest ? [ids[0], ids[2]] : ids), "Legacy malformed watched data was interpolated into SQL")
  end
  prefs.latest_only = false
  user.preferences = prefs
  user.watched = [ids[0]]
  first, _ = get_subscription_feed(user, 1, 1)
  second, _ = get_subscription_feed(user, 1, 2)
  check(first.map(&.id) == [ids[1]] && second.map(&.id) == [ids[2]], "Subscription pagination bindings changed")
  check(Invidious::Database::Users.select!(email: email).watched == before, "Subscription filtering wrote history")
  puts "Upstream import ID validation/error statuses, fork import preservation and parameterized subscription filters passed"
end

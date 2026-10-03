# Production routes and middleware; accounts.cr guards this disposable database.
def check_mobile_search_history(token, email)
  before = Invidious::Database::Users.select(email: email).not_nil!
  ids = (0...24).map { |i| "history%04d" % i }
  unknown = "unknownhist"
  preferences = JSON.parse(Invidious::Database::Users.preference_json(email)).as_h
  saved_preferences = preferences.to_json
  preferences["timezone"] = JSON::Any.new("Asia/Jakarta")
  preferences["max_results"] = JSON::Any.new(2_i64)
  channel = "UC" + "s" * 22
  outside = "UC" + "x" * 22
  today = Invidious::History.today("Asia/Jakarta")
  today_time = Time.parse(today, "%F", Time::Location::UTC)
  begin
    PG_DB.exec("UPDATE users SET watched = $1, preferences = $2, subscriptions = $3 WHERE email = $4", ids + [unknown], preferences.to_json, [channel], email)
    ids.each_with_index do |id, i|
      PG_DB.exec("INSERT INTO watch_history (email, video_id, title, channel_name, channel_id, release_date, latest_watched, length_seconds) VALUES ($1,$2,$3,'Archive Studio',$4,'2024-02-29',$5::date,123)",
        email, id, i == 23 ? "Needle café" : "Archive #{i}", channel, (today_time - i.days).to_s("%F"))
    end
    base = "/api/v1/auth/history?details=true&organized=true"
    response = security_request("GET", base, bearer: token)
    page = JSON.parse(response.get("test_result").as(String))
    check(response.response.headers["Cache-Control"] == "private, no-store", "Organized history can be publicly cached")
    check(page["entries"].as_a.size == 2 && page["total"] == 25 && page["hasMore"] == true, "Organized history ignored account page size or count")
    check(page["today"] == today && page["timezone"] == "Asia/Jakarta", "Organized history ignored account timezone")
    check(page["entries"][0]["video_id"] == ids[0], "History paginated before date organization")
    match = JSON.parse(security_request("GET", base + "&q=NEEDLE", bearer: token).get("test_result").as(String))
    check(match["total"] == 1 && match["entries"][0]["video_id"] == ids[23] && match["hasMore"] == false, "History searched only the current page")
    check(match["entries"][0]["release_date"] == "2024-02-29" && match["entries"][0]["length_seconds"] == 123, "Archived history metadata disappeared")
    channel_matches = JSON.parse(security_request("GET", base + "&q=archive+studio&page=12", bearer: token).get("test_result").as(String))
    check(channel_matches["total"] == 24 && channel_matches["entries"].as_a.size == 2 && channel_matches["hasMore"] == false, "History channel search or last page is wrong")
    last = JSON.parse(security_request("GET", base + "&page=13", bearer: token).get("test_result").as(String))
    check(last["entries"][0]["video_id"] == unknown && last["entries"][0]["title"]?.try(&.raw).nil?, "Unknown history entry was discarded")
    no_matches = JSON.parse(security_request("GET", base + "&q=absent", bearer: token).get("test_result").as(String))
    check(no_matches["entries"].as_a.empty? && no_matches["total"] == 0, "History no-match response is wrong")
    huge = JSON.parse(security_request("GET", base + "&page=2147483647", bearer: token).get("test_result").as(String))
    check(huge["entries"].as_a.empty? && huge["hasMore"] == false, "Organized history pagination overflowed")
    check(security_request("GET", base).response.status_code == 403, "Organized history accepts anonymous callers")
    other_sid = Invidious::Database::Accounts.register("SearchOther", "separate search account password", Preferences.from_json("{}"))
    other_token = Invidious::Database::Accounts.authenticate_mobile("SearchOther", "separate search account password").not_nil![:accessToken]
    other_history = JSON.parse(security_request("GET", base, bearer: other_token).get("test_result").as(String))
    check(other_history["entries"].as_a.empty?, "History leaked across accounts")

    23.times do |i|
      PG_DB.exec("INSERT INTO channel_videos (id,title,published,updated,ucid,author,length_seconds,live_now,views,members_only) VALUES ($1,'Search needle','2026-01-01',now(),$2,'Subscribed Studio',123,false,42,$3)", "search%05d" % i, channel, i == 0)
    end
    PG_DB.exec("INSERT INTO channel_videos (id,title,published,updated,ucid,author,length_seconds,live_now,members_only) VALUES ('outsidevid1','Search needle',now(),now(),$1,'Other Studio',123,false,false)", outside)
    path = "/api/v1/auth/subscriptions/search?q=needle"
    first_response = security_request("GET", path, bearer: token)
    first = JSON.parse(first_response.get("test_result").as(String)).as_a
    second = JSON.parse(security_request("GET", path + "&page=2", bearer: token).get("test_result").as(String)).as_a
    check(first.size == 20 && second.size == 3, "Subscription search did not search the complete library")
    check((first + second).map { |item| item["videoId"].as_s } == (0...23).map { |i| "search%05d" % i }, "Subscription pagination is unstable or includes an unsubscribed channel")
    check(first[0]["isMember"] == true && first[0]["lengthSeconds"] == 123, "Subscription member/duration metadata was lost")
    check(first_response.response.headers["Cache-Control"] == "private, no-store", "Subscription search can be publicly cached")
    by_channel = JSON.parse(security_request("GET", "/api/v1/auth/subscriptions/search?q=subscribed+studio", bearer: token).get("test_result").as(String)).as_a
    check(by_channel.size == 20, "Subscription search cannot match channel names")
    check(JSON.parse(security_request("GET", path, bearer: other_token).get("test_result").as(String)).as_a.empty?, "Subscription search leaked across accounts")
    check(security_request("GET", path).response.status_code == 403, "Anonymous subscription search was accepted")
    old_token = generate_token(email, ["GET:subscriptions"], nil, HMAC_KEY, JSON.parse(token)["session"].as_s)
    check(security_request("GET", path, bearer: old_token).response.status_code == 403, "Old subscription scope authorized search")
    check(JSON.parse(security_request("GET", path + "&page=2147483647", bearer: token).get("test_result").as(String)).as_a.empty?, "Subscription pagination overflowed")
    puts "Scoped subscription search and organized history: whole-library matching, pagination, metadata, scopes and isolation passed"
  ensure
    PG_DB.exec("UPDATE users SET watched = $1, subscriptions = $2, preferences = $3 WHERE email = $4", before.watched, before.subscriptions, saved_preferences, email)
    PG_DB.exec("DELETE FROM watch_history WHERE email = $1 AND video_id = ANY($2)", email, ids + [unknown])
    PG_DB.exec("DELETE FROM channel_videos WHERE ucid = ANY($1)", [channel, outside])
  end
end

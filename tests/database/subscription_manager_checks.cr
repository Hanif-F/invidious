# Runs against the guarded disposable database in accounts.cr.
def check_subscription_manager
  password = "an isolated subscription sorting password"
  store = Invidious::Database::Accounts
  preferences = Preferences.from_json(%({"timezone":"Asia/Jakarta","show_member_videos":false}))
  alice_sid = store.register("SortingAlice", password, preferences)
  bob_sid = store.register("SortingBob", password, preferences)
  alice_email = Invidious::Database::SessionIDs.select_email(alice_sid).not_nil!
  bob_email = Invidious::Database::SessionIDs.select_email(bob_sid).not_nil!
  channels = ('a'..'f').map { |letter| "UC" + letter.to_s * 22 }
  now = Time.utc(2026, 10, 7, 18)
  today = Time.utc(2026, 10, 8)
  watched = [] of String
  video_ids = [] of String
  begin
    channels.each_with_index do |id, index|
      PG_DB.exec("INSERT INTO channels VALUES ($1,$2,$3,false,$3)", id, ["Favorite", "No fresh favorite", "One-off", "Dormant", "Legacy", "Unknown"][index], now)
    end
    {0 => {6, 30}, 1 => {6, 30}, 2 => {1, 1}, 3 => {8, 90}}.each do |index, pair|
      count, age = pair
      count.times do |i|
        id = "sorting#{index}#{i.to_s.rjust(3, '0')}"
        watched << id
        PG_DB.exec("INSERT INTO watch_history(email,video_id,channel_id,latest_watched,archived_dates) VALUES ($1,$2,$3,$4::date,$5::date[])", alice_email, id, channels[index], (today - age.days).to_s("%F"), [(today - 60.days).to_s("%F")].reject { |date| date > (today - age.days).to_s("%F") })
      end
    end
    # Local video-cache recovery preserves known dates and leaves legacy dates unknown.
    watched += ["legacycache", "legacyfeed1", "unknownhist", watched.first]
    PG_DB.exec("INSERT INTO watch_history(email,video_id,latest_watched,archived_dates) VALUES ($1,'legacycache',$2::date,$3::date[])", alice_email, (today + 1.day).to_s("%F"), [today.to_s("%F")])
    PG_DB.exec("INSERT INTO videos(id,info,updated) VALUES ('legacycache',$1,$2)", {title: "Legacy", author: "Legacy", ucid: channels[4], lengthSeconds: 123}.to_json, now)
    PG_DB.exec("INSERT INTO watch_history(email,video_id,channel_id,latest_watched) VALUES ($1,'notwatched1',$2,$3::date),($4,'otheruser01',$2,$3::date)", alice_email, channels[2], today.to_s("%F"), bob_email)

    uploads = {
      "freshfav001" => {channels[0], now - 2.days, false, nil},
      "watchedfav1" => {channels[0], now - 6.hours, false, nil},
      "memberfav01" => {channels[0], now - 1.hour, true, nil},
      "futurefav01" => {channels[0], now + 1.day, false, nil},
      "premiere001" => {channels[0], now - 30.minutes, false, now + 1.day},
      "olderfav001" => {channels[1], now - 10.days, false, nil},
      "oneoffnew01" => {channels[2], now - 1.day, false, nil},
      "dormantnew1" => {channels[3], now, false, nil},
      "legacyfeed1" => {channels[4], now - 365.days, false, nil},
      "boundary001" => {channels[5], now - 7.days, false, nil},
    }
    uploads.each do |id, data|
      video_ids << id
      channel, published, member, premiere = data
      PG_DB.exec("INSERT INTO channel_videos(id,title,published,updated,ucid,author,length_seconds,live_now,premiere_timestamp,members_only) VALUES ($1,'Upload',$2,$3,$4,'Creator',123,false,$5,$6)", id, published, now, channel, premiere, member)
    end
    watched << "watchedfav1"
    PG_DB.exec("INSERT INTO watch_history(email,video_id,channel_id,latest_watched) VALUES ($1,'watchedfav1',$2,$3::date)", alice_email, channels[0], (today - 90.days).to_s("%F"))
    PG_DB.exec("UPDATE users SET watched=$1,subscriptions=$2 WHERE email=$3", watched, channels, alice_email)
    PG_DB.exec("UPDATE users SET subscriptions=$1 WHERE email=$2", channels, bob_email)
    alice = Invidious::Database::Users.select!(email: alice_email)
    before = PG_DB.query_one("SELECT json_agg(h ORDER BY email,video_id)::text FROM watch_history h", as: String)
    stats = Invidious::Database::SubscriptionManager.select(alice, false, now)
    check(stats[channels[0]].latest_upload == now - 6.hours, "Future/premiere/member uploads entered latest sorting")
    check(stats[channels[0]].fresh_upload == now - 2.days, "Watched upload hid an older eligible unwatched upload")
    check(stats[channels[0]].recent_watched == 6 && stats[channels[0]].all_time_watched == 7, "Duplicate IDs or repeat dates inflated viewing counts")
    check((stats[channels[0]].habit_weight - 4.0).abs < 1e-10, "Account timezone or linear habit decay was ignored")
    check(stats[channels[2]].all_time_watched == 1, "Another user's or removed history entered the counts")
    check(stats[channels[3]].relevance(now) == 0, "Dormant channel gained relevance from fresh uploads")
    check(stats[channels[4]].all_time_watched == 2 && stats[channels[4]].recent_watched == 1, "Read-only cache recovery lost saved dates or invented legacy dates")
    check(stats[channels[5]].fresh_upload.nil?, "Exactly seven-day-old upload received a freshness bonus")
    check(stats[channels[1]].relevance(now) > stats[channels[2]].relevance(now), "Freshness outweighed strong viewing habits")
    members = Invidious::Database::SubscriptionManager.select(alice, true, now)
    check(members[channels[0]].latest_upload == now - 1.hour && members[channels[0]].fresh_upload == now - 1.hour, "Member-video preference was ignored")
    check(Invidious::Database::SubscriptionManager.select(Invidious::Database::Users.select!(email: bob_email), false, now).values.all? { |data| data.all_time_watched == 0 }, "Subscription manager leaked another account's history")
    check(before == PG_DB.query_one("SELECT json_agg(h ORDER BY email,video_id)::text FROM watch_history h", as: String), "Subscription manager wrote history backfills")

    # Native clients opt into the exact same stats, without granting history to subscription-only tokens.
    plain = security_request("GET", "/api/v1/auth/subscriptions", alice_sid)
    check(!plain.get("test_result").as(String).includes?("subscriptionStats"), "Ordinary subscriptions gained stats")
    subscription_reader = generate_token(alice_email, ["GET:subscriptions"], nil, HMAC_KEY, alice_sid)
    allowed_plain = security_request("GET", "/api/v1/auth/subscriptions", bearer: subscription_reader)
    check(allowed_plain.response.status_code == 200, "Subscription-only token lost ordinary directory access")
    denied = security_request("GET", "/api/v1/auth/subscriptions?include_stats=true", bearer: subscription_reader)
    check(denied.response.status_code == 403, "Subscription-only token received history statistics")
    check(denied.response.headers["Cache-Control"] == "private, no-store", "Denied stats response was cacheable")
    history_reader = generate_token(alice_email, ["GET:history"], nil, HMAC_KEY, alice_sid)
    check(security_request("GET", "/api/v1/auth/subscriptions?include_stats=true", bearer: history_reader).response.status_code == 403, "History-only token received subscriptions")
    check(security_request("GET", "/api/v1/auth/subscriptions?include_stats=true").response.status_code == 403, "Anonymous client received subscription stats")
    full_reader = generate_token(alice_email, ["GET:subscriptions", "GET:history"], nil, HMAC_KEY, alice_sid)
    api_now = Time.utc
    expected_stats = Invidious::Database::SubscriptionManager.select(alice, false, api_now)
    native = security_request("GET", "/api/v1/auth/subscriptions?include_stats=true", bearer: full_reader)
    check(native.response.status_code == 200 && native.response.headers["Cache-Control"] == "private, no-store", "Native stats request failed or was cacheable")
    JSON.parse(native.get("test_result").as(String)).as_a.each do |row|
      expected = expected_stats[row["authorId"].as_s]
      actual = row["subscriptionStats"]
      check(actual["latestUpload"].as_i64? == expected.latest_upload.try(&.to_unix), "Native latest upload differs from shared stats")
      check(actual["allTimeWatched"].as_i == expected.all_time_watched && actual["recentWatched"].as_i == expected.recent_watched, "Native counts differ from shared stats")
      check((actual["relevance"].as_f - expected.relevance(api_now)).abs < 1e-5, "Native relevance differs from shared ranking")
    end
    check(native.response.cookies[Invidious::Frontend::SubscriptionManager::COOKIE]?.nil?, "Native stats modified browser sorting")
    bob_native = security_request("GET", "/api/v1/auth/subscriptions?include_stats=true", bob_sid)
    check(JSON.parse(bob_native.get("test_result").as(String)).as_a.all? { |row| row["subscriptionStats"]["allTimeWatched"].as_i == 0 }, "Native statistics leaked across accounts")
    check(before == PG_DB.query_one("SELECT json_agg(h ORDER BY email,video_id)::text FROM watch_history h", as: String), "Native stats wrote history backfills")

    # Exercise the production route, browser cookie, exports and unsubscribe handler.
    page = security_request("GET", "/subscription_manager?sort_by=most_watched", alice_sid)
    html = page.get("test_result").as(String)
    check(html.includes?("value=\"most_watched\" selected") && html.includes?("8 videos watched all time"), "Manager sort or row details were not rendered")
    check(page.response.headers["Cache-Control"] == "private, no-store", "Personalized subscription manager was publicly cacheable")
    cookie = page.response.cookies[Invidious::Frontend::SubscriptionManager::COOKIE]
    check(cookie.value == "most_watched" && cookie.http_only, "Manager did not save a dedicated browser preference")
    env = context("GET", "/subscription_manager", cookies: "#{cookie.name}=#{cookie.value}")
    env.set "user", alice
    env.set "sid", alice_sid
    check(Invidious::Routes::Subscriptions.subscription_manager(env).not_nil!.includes?("value=\"most_watched\" selected"), "Browser sort did not persist on return")
    export = security_request("GET", "/subscription_manager?action_takeout=1&sort_by=relevance", alice_sid)
    check(XML.parse(export.get("test_result").as(String)).xpath_nodes("//outline[@type='rss']").size == channels.size, "Sorting changed the OPML export")
    check(export.response.cookies[Invidious::Frontend::SubscriptionManager::COOKIE]?.nil?, "Export changed the browser sort preference")
    csrf = generate_response(alice_sid, {"POST:subscription_ajax"}, HMAC_KEY)
    remove = security_request("POST", "/subscription_ajax?action=remove_subscriptions&redirect=false&c=#{channels[0]}", alice_sid, body: URI::Params.encode({"csrf_token" => csrf}), content_type: "application/x-www-form-urlencoded")
    check(remove.response.status_code == 200 && !Invidious::Database::Users.select!(email: alice_email).subscriptions.includes?(channels[0]), "Sorting broke subscription removal")
    empty = Invidious::Database::Users.select!(email: bob_email)
    empty.subscriptions = [] of String
    check(Invidious::Database::SubscriptionManager.select(empty, false, now).empty?, "Empty subscriptions did not short-circuit")
    puts "Subscription sorting: cache-only queries, decay, freshness, visibility, counts, isolation, cookies, exports and unsubscribe passed"
  ensure
    store.delete(alice_email, alice_sid, password)
    store.delete(bob_email, bob_sid, password)
    PG_DB.exec("DELETE FROM channel_videos WHERE id=ANY($1)", video_ids)
    PG_DB.exec("DELETE FROM videos WHERE id='legacycache'")
    PG_DB.exec("DELETE FROM channels WHERE id=ANY($1)", channels)
  end
end

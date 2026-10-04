# No upstream calls: IV sources and constructed mix snapshots exercise production handlers.
def check_mobile_playlist_rss(token, email, sid)
  store = Invidious::Database::Accounts
  password = "a playlist source account password"
  owner_sid = store.register("PlaylistOwner", password, Preferences.from_json("{}"))
  owner = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(owner_sid).not_nil!)
  owner_token = generate_token(owner.email, Invidious::Routes::API::V1::Mobile::SCOPES.to_a, nil, HMAC_KEY, owner_sid)
  public_list = create_playlist("Owner's public & playlist", PlaylistPrivacy::Public, owner)
  unlisted = create_playlist("Owner unlisted", PlaylistPrivacy::Unlisted, owner)
  private_list = create_playlist("Owner private", PlaylistPrivacy::Private, owner)
  path = "/api/v1/auth/saved_playlists/#{public_list.id}"
  reader = generate_token(email, ["GET:playlists/*"], nil, HMAC_KEY, sid)
  check(security_request("PUT", path, bearer: reader, body: "{}").response.status_code == 403, "Read-only token subscribed")
  check(security_request("PUT", path, sid, body: "{}").response.status_code == 403, "Cookie subscribe skipped CSRF")
  check(security_request("PUT", path, bearer: token, body: "bad").response.status_code == 400, "Malformed subscription JSON accepted")
  check(security_request("PUT", "/api/v1/auth/saved_playlists/#{private_list.id}", bearer: token, body: "{}").response.status_code == 404, "Another account subscribed to a private source")
  check(security_request("PUT", path, bearer: owner_token, body: "{}").response.status_code == 400, "Owned playlist was duplicated as a subscription")
  results = Channel(Int32).new(2)
  2.times { spawn { results.send(security_request("PUT", path, bearer: token, body: "{}").response.status_code) } }
  check(Array.new(2) { results.receive }.all? { |code| code == 200 }, "Concurrent subscription failed")
  check(PG_DB.query_one("SELECT count(*) FROM saved_playlists WHERE email=$1 AND source_id=$2", email, public_list.id, as: Int64) == 1, "Repeated subscription duplicated a row")
  subscriber_sid = store.register("PlaylistSubscriber", password, Preferences.from_json("{}"))
  subscriber = Invidious::Database::SessionIDs.select_email(subscriber_sid).not_nil!
  subscriber_token = generate_token(subscriber, Invidious::Routes::API::V1::Mobile::SCOPES.to_a, nil, HMAC_KEY, subscriber_sid)
  check(security_request("PUT", path, bearer: subscriber_token, body: "{}").response.status_code == 200, "Second account could not independently subscribe")
  check(security_request("PUT", "/api/v1/auth/saved_playlists/#{unlisted.id}", bearer: token, body: "{}").response.status_code == 200, "Unlisted source rejected")
  library = security_request("GET", "/api/v1/auth/playlists", bearer: token)
  lists = JSON.parse(library.get("test_result").as(String)).as_a
  check(lists.any? { |item| item["playlistId"] == unlisted.id && item["privacy"] == "unlisted" && !item["isOwned"].as_bool && item["isSaved"].as_bool }, "Library lost source privacy or ownership")
  check(library.response.headers["Cache-Control"] == "private, no-store", "Library may be cached publicly")
  check(security_request("PATCH", "/api/v1/auth/playlists/#{public_list.id}", bearer: token, body: %({"title":"Unauthorized edit"})).response.status_code == 403, "Subscribed playlist allowed editing")
  page = context("GET", "/feed/playlists")
  page.set "user", Invidious::Database::Users.select!(email: email)
  page.set "sid", sid
  html = Invidious::Routes::Feeds.playlists(page).not_nil!
  check(html.includes?(%(My playlists (<span id="count">0</span>))) && html.includes?(%(Subscribed playlists (<span id="count">2</span>))), "Web headings lost labels or counts")
  Invidious::Database::Playlists.update(public_list.id, "Owner changed title", public_list.privacy, "New description", Time.utc)
  changed_video = PlaylistVideo.new({title: "Owner added video", id: "abcdefghijk", author: "Owner", ucid: "UCowner", length_seconds: 10, published: Time.utc, plid: public_list.id, index: 7_i64, live_now: false, members_only: false})
  Invidious::Database::PlaylistVideos.insert(changed_video)
  Invidious::Database::Playlists.update_video_added(public_list.id, changed_video.index)
  detail = security_request("GET", "/api/v1/auth/playlists/#{public_list.id}", bearer: token)
  check(JSON.parse(detail.get("test_result").as(String))["title"] == "Owner changed title", "Subscribed detail did not follow owner updates")
  check(JSON.parse(detail.get("test_result").as(String))["videos"].as_a.size == 1, "Subscribed contents did not follow owner updates")
  check(Invidious::Database::SavedPlaylists.list(email).any? { |item| item["title"] == "Owner changed title" }, "Updated source metadata was not cached")
  2.times { check(security_request("DELETE", path, bearer: token).response.status_code == 204, "Unsubscribe is not idempotent") }
  check(!Invidious::Database::SavedPlaylists.exists?(email, public_list.id) && Invidious::Database::SavedPlaylists.exists?(subscriber, public_list.id), "Unsubscribe changed another account")
  check(Invidious::Database::Playlists.select(id: public_list.id).not_nil!.title == "Owner changed title", "Unsubscribe deleted the source")
  Invidious::Database::SavedPlaylists.refresh(email, Invidious::NativePlaylists.metadata(public_list, email))
  check(!Invidious::Database::SavedPlaylists.exists?(email, public_list.id), "Late refresh resurrected an unsubscribed source")
  Invidious::Database::Playlists.delete(unlisted.id)
  check(security_request("GET", "/api/v1/auth/playlists/#{unlisted.id}", bearer: token).response.status_code == 404, "Deleted source still resolves")
  cached = Invidious::Database::SavedPlaylists.list(email).find { |item| item["playlistId"] == unlisted.id }.not_nil!
  check(cached["title"] == "Owner unlisted" && cached["privacy"] == "unlisted", "Unavailable source lost cached metadata")
  check(security_request("DELETE", "/api/v1/auth/saved_playlists/#{unlisted.id}", bearer: token).response.status_code == 204, "Unavailable source cannot be unsubscribed")
  legacy = Invidious::NativePlaylists.metadata(public_list, email)
  legacy["playlistId"] = JSON::Any.new("PLcallerLegacy")
  PG_DB.exec("INSERT INTO playlists(id, author, title) VALUES ('PLcallerLegacy',$1,'Legacy')", email)
  Invidious::Database::SavedPlaylists.save(email, legacy)
  Invidious::Database::SavedPlaylists.save(subscriber, legacy)
  Invidious::Database::SavedPlaylists.delete(subscriber, "PLcallerLegacy")
  check(PG_DB.query_one("SELECT count(*) FROM playlists WHERE id='PLcallerLegacy'", as: Int64) == 1, "Unsubscribe deleted another caller's legacy save")
  Invidious::Database::SavedPlaylists.delete(email, "PLcallerLegacy")
  check(PG_DB.query_one("SELECT count(*) FROM playlists WHERE id='PLcallerLegacy'", as: Int64) == 0, "Unsubscribe kept caller's legacy save")

  feed = security_request("GET", "/api/v1/auth/feed/rss", bearer: token)
  relative = JSON.parse(feed.get("test_result").as(String))["feedPath"].as_s
  check(relative.starts_with?("/feed/private?token=") && !relative.includes?(token), "Subscription link leaked native credentials")
  check(feed.response.headers["Cache-Control"] == "private, no-store", "Subscription link may be cached")
  check(security_request("GET", "/api/v1/auth/feed/rss", bearer: reader).response.status_code == 403, "Playlist token gained secret feed permission")
  check(security_request("GET", "/api/v1/auth/playlists/#{private_list.id}/feed", bearer: token).response.status_code == 404, "Private Atom was exported by another account")
  atom = security_request("GET", "/api/v1/auth/playlists/#{private_list.id}/feed", bearer: owner_token)
  check(atom.response.status_code == 200 && atom.response.content_type == "application/atom+xml", "Owner Atom export failed")
  doc = XML.parse(atom.get("test_result").as(String))
  ns = {"a" => "http://www.w3.org/2005/Atom"}
  check(doc.xpath_nodes("/a:feed/a:title", ns).size == 1 && doc.xpath_nodes("/a:feed/a:entry", ns).empty?, "Empty Atom is invalid")
  check(atom.response.headers["Cache-Control"] == "private, no-store", "Private Atom may be cached")
  entry = PlaylistVideo.new({title: "Private entry", id: "abcdefghijk", author: "Owner", ucid: "UCowner", length_seconds: 10, published: Time.utc, plid: private_list.id, index: 42_i64, live_now: false, members_only: false})
  Invidious::Database::PlaylistVideos.insert(entry)
  Invidious::Database::Playlists.update_video_added(private_list.id, entry.index)
  populated = security_request("GET", "/api/v1/auth/playlists/#{private_list.id}/feed", bearer: owner_token)
  check(XML.parse(populated.get("test_result").as(String)).xpath_nodes("/a:feed/a:entry/a:updated", ns).size == 1, "Populated Atom lacks required entry time")

  # More than one feed page, including an uncached/deleted channel, must all export.
  ids = Array.new(165) { |i| "UCfixture#{i}" }
  ids.first(164).each { |id| PG_DB.exec("INSERT INTO channels VALUES ($1,$1,now(),false,now())", id) }
  PG_DB.exec("UPDATE users SET subscriptions=$2 WHERE email=$1", email, ids)
  {"rss", "newpipe"}.each do |format|
    exported = security_request("GET", "/api/v1/auth/subscriptions/export?format=#{format}", bearer: token)
    outlines = XML.parse(exported.get("test_result").as(String)).xpath_nodes("//outline[@xmlUrl]")
    check(outlines.size == ids.size, "OPML truncated subscriptions")
    check(outlines.all? { |outline| outline["xmlUrl"].starts_with?(format == "rss" ? HOST_URL : "https://www.youtube.com/") }, "OPML used wrong feed format")
  end
  check(security_request("GET", "/api/v1/auth/subscriptions/export?format=bad", bearer: token).response.status_code == 400, "Invalid OPML format accepted")
  check(XML.parse(Invidious::RSS.subscriptions([] of String)).xpath_nodes("//outline[@xmlUrl]").empty?, "Empty OPML failed")
  mix = Mix.new({id: "RDopaque", title: "Mix & fixture", videos: [MixVideo.new({title: "Snapshot", id: "abcdefghijk", author: "Owner", ucid: "UCowner", length_seconds: 10, index: 0, rdid: "RDopaque", members_only: false})]})
  mix_xml = Invidious::RSS.mix(mix, "abcdefghijk")
  mix_fields = Invidious::NativePlaylists.metadata(mix, "abcdefghijk")
  Invidious::Database::SavedPlaylists.save(email, mix_fields)
  mix_fields["seedVideoId"] = JSON::Any.new("zyxwvutsrqp")
  Invidious::Database::SavedPlaylists.refresh(email, mix_fields)
  check(Invidious::Database::SavedPlaylists.seed(email, "RDopaque") == "abcdefghijk", "Pagination replaced the subscribed mix seed")
  check(Invidious::Database::SavedPlaylists.list(email).find { |item| item["playlistId"] == "RDopaque" }.not_nil!["seedVideoId"] == "abcdefghijk", "Library lost original mix seed")
  check(XML.parse(mix_xml).xpath_nodes("/a:feed/a:entry/a:updated", ns).size == 1 && mix_xml.includes?("continuation=abcdefghijk"), "Mix snapshot lost namespace or seed")
  must_fail("Opaque mix silently lost its seed") { Invidious::NativePlaylists.seed("RDopaque") }
  check(Invidious::NativePlaylists.seed("RDabcdefghijk") == "abcdefghijk", "Embedded mix seed lost")
  check(store.delete(subscriber, subscriber_sid, password), "Subscriber cleanup failed")
  check(PG_DB.query_one("SELECT count(*) FROM saved_playlists WHERE email=$1", subscriber, as: Int64) == 0, "Account deletion did not cascade bookmarks")
  puts "Playlist subscriptions, migration 20, isolation, source updates, private Atom, complete OPML and mix XML passed"
end

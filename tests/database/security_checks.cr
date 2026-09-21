# Loaded by accounts.cr after migration, against its guarded disposable database.
# Exercise production authentication, before filters, and route implementations.
class SecurityTestEndpoint
  include HTTP::Handler

  def call(context)
    env = context
    Invidious::Routes::BeforeAll.handle(env)
    result = case env.request.path
             when "/api/v1/auth/csrf"
               Invidious::Routes::API::V1::Authenticated.get_csrf(env)
             when "/api/v1/auth/tokens"
               Invidious::Routes::API::V1::Authenticated.get_tokens(env)
             when "/api/v1/auth/tokens/unregister"
               Invidious::Routes::API::V1::Authenticated.unregister_token(env)
             when "/api/v1/auth/preferences"
               if env.request.method == "POST"
                 Invidious::Routes::API::V1::Authenticated.set_preferences(env)
               else
                 Invidious::Routes::API::V1::Authenticated.get_preferences(env)
               end
             when "/preferences"
               Invidious::Routes::PreferencesRoute.update(env)
             when "/data_control"
               Invidious::Routes::PreferencesRoute.update_data_control(env)
             when "/subscribe_playlist"
               Invidious::Routes::Playlists.subscribe(env)
             when "/embed/"
               Invidious::Routes::Embed.redirect(env)
             when "/embed/videoseries"
               env.params.url["id"] = "videoseries"
               Invidious::Routes::Embed.show(env)
             when "/api/v1/playlists/IVsecurity"
               env.params.url["plid"] = "IVsecurity"
               Invidious::Routes::API::V1::Misc.get_playlist(env)
             when "/feed/playlist/IVsecurity"
               env.params.url["plid"] = "IVsecurity"
               Invidious::Routes::Feeds.rss_playlist(env)
             when "/videoplayback"
               Invidious::Routes::VideoPlayback.get_video_playback(env)
             else
               ""
             end
    env.set "test_result", result.to_s
  end
end

def security_request(method, path, sid = nil, bearer = nil, body = "", content_type = "application/json", csrf = nil)
  headers = HTTP::Headers{"Content-Type" => content_type}
  headers["Cookie"] = "SID=#{sid}" if sid
  headers["Authorization"] = "Bearer #{bearer}" if bearer
  headers["X-CSRF-Token"] = csrf if csrf
  env = HTTP::Server::Context.new(HTTP::Request.new(method, path, headers, body), HTTP::Server::Response.new(IO::Memory.new))
  handler = AuthHandler.new
  handler.next = SecurityTestEndpoint.new
  handler.call(env)
  env
end

def check_public_security
  {"/feed/private?token=secret", "/login?password=secret", "/authorize_token?callback_url=https%3A%2F%2Fexample.test%3Ftoken%3Dsecret", "/feed/webhook/secret"}.each do |resource|
    check(!Invidious::LogHandler.redacted_path(resource).includes?("secret"), "Credential appeared in request log")
  end
  Invidious::Routing.register_user_routes
  Invidious::Routing.register_iv_playlist_routes
  {"/toggle_theme", "/subscribe_playlist"}.each do |path|
    check(!Kemal::RouteHandler::INSTANCE.lookup_route("GET", path).found?, "Mutating GET remains registered: #{path}")
    check(Kemal::RouteHandler::INSTANCE.lookup_route("POST", path).found?, "Protected POST is missing: #{path}")
  end
  password = "an isolated security test password"
  store = Invidious::Database::Accounts
  alice_sid = store.register("SecurityAlice", password, Preferences.from_json(%({"save_player_pos":true,"theme":"diary"})))
  bob_sid = store.register("SecurityBob", password, Preferences.from_json(%({"save_player_pos":true})))
  alice = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(alice_sid).not_nil!)
  bob = Invidious::Database::Users.select!(email: Invidious::Database::SessionIDs.select_email(bob_sid).not_nil!)
  restricted = generate_token(alice.email, ["GET:tokens", "POST:tokens/unregister"], nil, HMAC_KEY, alice_sid)
  api_id = JSON.parse(restricted)["session"].as_s
  bob_token = generate_token(bob.email, [":*"], nil, HMAC_KEY, bob_sid)
  bob_api_id = JSON.parse(bob_token)["session"].as_s

  result = security_request("GET", "/api/v1/auth/tokens", bearer: restricted)
  check(result.response.status_code == 200, "Restricted token cannot list API tokens")
  sessions = JSON.parse(result.get("test_result").as(String)).as_a.map { |entry| entry["session"].as_s }
  check(sessions == [api_id], "API token listing exposed browser credentials or another user's tokens")
  check(result.response.headers["Cache-Control"] == "private, no-store", "Token response may be cached")
  denied = security_request("GET", "/api/v1/auth/preferences", bearer: restricted)
  check(denied.response.status_code == 403, "Restricted token gained preference access")
  check(denied.response.headers["Cache-Control"] == "private, no-store", "Auth errors may be cached")

  {bob_sid, bob_api_id}.each do |target|
    result = security_request("POST", "/api/v1/auth/tokens/unregister", bearer: restricted, body: {session: target}.to_json)
    check(result.response.status_code == 204, "Revocation must not disclose foreign session existence")
    check(Invidious::Database::SessionIDs.select_email(target) == bob.email, "Cross-account session was revoked")
  end
  sibling = JSON.parse(generate_token(alice.email, ["GET:preferences"], nil, HMAC_KEY, alice_sid))["session"].as_s
  security_request("POST", "/api/v1/auth/tokens/unregister", bearer: restricted, body: {session: sibling}.to_json)
  check(Invidious::Database::SessionIDs.select_email(sibling).nil?, "Own sibling token cannot be revoked")

  reader = generate_token(alice.email, ["GET:preferences"], nil, HMAC_KEY, alice_sid)
  mixed = security_request("GET", "/api/v1/auth/preferences", bob_sid, reader)
  check(JSON.parse(mixed.get("test_result").as(String))["theme"].as_s == "diary", "Browser cookie replaced bearer identity")
  csrf_response = security_request("GET", "/api/v1/auth/csrf", alice_sid)
  csrf = JSON.parse(csrf_response.get("test_result").as(String))["csrfToken"].as_s
  before = Invidious::Database::Users.select!(email: alice.email).preferences.to_json
  {nil, "invalid", generate_response(bob_sid, {"POST:*"}, HMAC_KEY), generate_response(alice_sid, {"POST:*"}, HMAC_KEY, -1.hour), generate_response(alice_sid, {"POST:tokens/unregister"}, HMAC_KEY)}.each do |invalid|
    result = security_request("POST", "/api/v1/auth/preferences", alice_sid, body: %({"theme":"cinematic"}), csrf: invalid)
    check(result.response.status_code == 403, "Invalid API CSRF accepted")
    check(Invidious::Database::Users.select!(email: alice.email).preferences.to_json == before, "Rejected API request mutated preferences")
  end
  result = security_request("POST", "/api/v1/auth/preferences", alice_sid, body: %({"theme":"cinematic","save_player_pos":true}), csrf: csrf)
  check(result.response.status_code == 204, "Valid API CSRF rejected")
  writer = generate_token(alice.email, ["POST:preferences"], nil, HMAC_KEY, alice_sid)
  result = security_request("POST", "/api/v1/auth/preferences", bearer: writer, body: %({"theme":"diary","save_player_pos":true}))
  check(result.response.status_code == 204, "Bearer-only API writes now require browser CSRF")
  check(Invidious::Database::Users.select!(email: bob.email).preferences.theme == bob.preferences.theme, "Preference write changed another account")
  check(security_request("POST", "/api/v1/auth/preferences", body: "{}").response.status_code == 403, "Anonymous API write accepted")

  {"/preferences", "/subscribe_playlist?list=IVsecurity"}.each do |path|
    result = security_request("POST", path, alice_sid, body: "theme=cinematic", content_type: "application/x-www-form-urlencoded")
    check(result.response.status_code == 403, "Unprotected form mutation: #{path}")
  end
  before = Invidious::Database::Users.select!(email: alice.email).preferences.to_json
  boundary = "security-test-boundary"
  import_data = %({"preferences":{"theme":"cinematic","save_player_pos":true}})
  file_part = "--#{boundary}\r\nContent-Disposition: form-data; name=\"import_invidious\"; filename=\"data.json\"\r\nContent-Type: application/json\r\n\r\n#{import_data}\r\n"
  token = generate_response(alice_sid, {"POST:data_control"}, HMAC_KEY)
  token_part = "--#{boundary}\r\nContent-Disposition: form-data; name=\"csrf_token\"\r\n\r\n#{token}\r\n"
  {file_part, file_part + token_part, token_part.sub(token, "invalid") + file_part}.each do |parts|
    result = security_request("POST", "/data_control", alice_sid, body: parts + "--#{boundary}--\r\n", content_type: "multipart/form-data; boundary=#{boundary}")
    check(result.response.status_code == 403, "Import processed data before CSRF authorization")
    check(Invidious::Database::Users.select!(email: alice.email).preferences.to_json == before, "Rejected import mutated preferences")
  end
  result = security_request("POST", "/data_control", alice_sid, body: token_part + file_part + "--#{boundary}--\r\n", content_type: "multipart/form-data; boundary=#{boundary}")
  check(result.response.status_code == 302 && Invidious::Database::Users.select!(email: alice.email).preferences.theme == "cinematic", "Valid import did not work")
  token = generate_response(alice_sid, {"POST:preferences"}, HMAC_KEY)
  result = security_request("POST", "/preferences", alice_sid, body: URI::Params.encode({"theme" => "diary", "save_player_pos" => "on", "csrf_token" => token}), content_type: "application/x-www-form-urlencoded")
  check(result.response.status_code == 302, "Valid preferences form rejected")

  PG_DB.exec("INSERT INTO playlists VALUES ('Secret', 'IVsecurity', $1, '', 2, now(), now(), 'Private', ARRAY[1,2]::bigint[])", alice.email)
  {"abcdefghijk", "lmnopqrstuv"}.each_with_index do |id, index|
    PG_DB.exec("INSERT INTO playlist_videos (title, id, author, ucid, length_seconds, published, plid, index, live_now, members_only) VALUES ('Secret item', $1, 'Channel', 'UCtest', 60, now(), 'IVsecurity', $2, false, false)", id, index + 1)
  end
  {"/embed/", "/embed/videoseries"}.each do |path|
    {nil, bob_sid}.each do |visitor|
      2.times do |index|
        result = security_request("GET", "#{path}?list=IVsecurity&index=#{index}", visitor)
        check(result.response.status_code == 404 && !result.response.headers.has_key?("Location"), "Private playlist leaked through #{path}")
      end
    end
    result = security_request("GET", "#{path}?list=IVsecurity&index=1", alice_sid)
    check(result.response.status_code == 302 && result.response.headers["Location"].includes?("lmnopqrstuv"), "Owner cannot embed own playlist")
  end
  {"/api/v1/playlists/IVsecurity", "/feed/playlist/IVsecurity"}.each do |path|
    {nil, bob_sid}.each do |visitor|
      check(security_request("GET", path, visitor).response.status_code == 404, "Private playlist readable by non-owner")
    end
    check(security_request("GET", path, alice_sid).response.headers["Cache-Control"] == "private, no-store", "Private playlist response may be cached")
  end
  {"Public", "Unlisted"}.each do |privacy|
    PG_DB.exec("UPDATE playlists SET privacy = $1::privacy WHERE id = 'IVsecurity'", privacy)
    check(security_request("GET", "/embed/videoseries?list=IVsecurity").response.status_code == 302, "Public/unlisted embeds broken")
  end
  PG_DB.exec("INSERT INTO playlists VALUES ('Bob', 'IVsecurityBob', $1, '', 0, now(), now(), 'Private', '{}')", bob.email)
  # A failure after playlist-video removal must roll back the entire deletion.
  PG_DB.exec("CREATE FUNCTION reject_security_delete() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''test rollback''; END'")
  PG_DB.exec("CREATE TRIGGER reject_security_delete BEFORE DELETE ON playlists FOR EACH ROW EXECUTE FUNCTION reject_security_delete()")
  must_fail("Deletion failure did not surface") { store.delete(alice.email, alice_sid, password) }
  check(Invidious::Database::SessionIDs.select_email(alice_sid) == alice.email, "Failed deletion revoked sessions")
  check(PG_DB.query_one("SELECT count(*) FROM playlist_videos WHERE plid = 'IVsecurity'", as: Int64) == 2, "Failed deletion lost playlist items")
  PG_DB.exec("DROP TRIGGER reject_security_delete ON playlists")
  PG_DB.exec("DROP FUNCTION reject_security_delete()")
  check(!store.delete(alice.email, alice_sid, "wrong"), "Bad password deleted account")
  check(store.delete(alice.email, alice_sid, password), "Account deletion failed")
  check(PG_DB.query_one("SELECT count(*) FROM playlists WHERE author = $1", alice.email, as: Int64) == 0, "Deleted user's playlists survived")
  check(PG_DB.query_one("SELECT count(*) FROM playlist_videos WHERE plid = 'IVsecurity'", as: Int64) == 0, "Deleted user's playlist items survived")
  check(PG_DB.query_one("SELECT count(*) FROM playlists WHERE author = $1", bob.email, as: Int64) == 1, "Deletion removed another user's playlist")
  check(Invidious::Database::SessionIDs.select_email(bob_sid) == bob.email, "Deletion removed another user's session")

  {"r1.googlevideo.com@127.0.0.1", "r1.googlevideo.com.attacker.invalid", "127.0.0.1/r1.googlevideo.com"}.each do |host|
    result = security_request("GET", "/videoplayback?host=#{URI.encode_www_form(host)}")
    check(result.response.status_code == 400, "Invalid media destination reached network path")
  end
  check(security_request("GET", "/feed/private?token=secret").response.headers["Cache-Control"] == "private, no-store", "Private feed is cacheable")
  puts "Public security checks passed: ownership, embeds, API scopes, CSRF, deletion and cache headers"
end

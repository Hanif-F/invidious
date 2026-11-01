module Invidious::Frontend::ErrorPages
  extend self

  def prepare(env)
    preferences = env.get?("preferences").try(&.as?(Preferences)) || Preferences.from_json("{}")
    env.set "preferences", preferences
    env.set "error_page", true
    env.set "search", ""
    # Header login/theme actions must not copy the failed private query either.
    env.set "page_return", Desktop.api_only? ? "/admin/settings" : "/search"
    Authentication.no_store(env)
    env.response.headers["Referrer-Policy"] = "no-referrer"
    env.response.content_type = "text/html; charset=utf-8"
    preferences.locale
  end

  def embedded?(env) : Bool
    env.request.path.starts_with?("/embed/") || env.request.headers["Sec-Fetch-Dest"]? == "iframe"
  end

  def heading_key(env, status : Int32) : String
    if status == 404
      path = env.request.path
      path == "/watch" || path.starts_with?("/embed/") || path.starts_with?("/clip/") ? "error_video_unavailable_heading" : "error_not_found_heading"
    elsif status == 401 || status == 403
      "error_access_heading"
    else
      "error_request_heading"
    end
  end

  # Only route patterns enter a public diagnostic. Never include a raw resource,
  # query, body, callback, private feed credential, exception message or backtrace.
  def route_pattern(path : String) : String
    return path if {"/", "/watch", "/search", "/playlist", "/mix", "/privacy", "/licenses",
                    "/login", "/signup", "/signout", "/account", "/account/username", "/change_password",
                    "/delete_account", "/token_manager", "/authorize_token", "/token_ajax", "/tv", "/data_control",
                    "/preferences", "/create_playlist", "/edit_playlist", "/delete_playlist", "/add_playlist_items",
                    "/create_clip", "/delete_clip", "/clear_watch_history", "/subscription_manager"}.includes?(path)
    {"/embed/" => "/embed/:id", "/clip/" => "/clip/:id", "/channel/" => "/channel/:id/*",
     "/post/" => "/post/:id", "/hashtag/" => "/hashtag/:name", "/feed/" => "/feed/*",
     "/preferences/" => "/preferences/*", "/admin/" => "/admin/*", "/api/" => "/api/*"}.each do |prefix, pattern|
      return pattern if path.starts_with?(prefix)
    end
    "[unmatched route]"
  end

  # Reconstruct a read-only retry from validated public identifiers. Unrecognized
  # query fields are discarded; sensitive/private POST searches are never replayed.
  def retry_url(env) : String?
    return unless {"GET", "HEAD"}.includes?(env.request.method)
    path = env.request.path
    return path if {"/feed/popular", "/feed/trending", "/feed/subscriptions", "/feed/history", "/feed/playlists", "/feed/clips", "/privacy", "/licenses"}.includes?(path)
    if path == "/watch" && (id = env.params.query["v"]?) && id.matches?(/\A[A-Za-z0-9_-]{11}\z/)
      return "/watch?v=#{id}"
    end
    return path if path.matches?(%r{\A/channel/UC[A-Za-z0-9_-]{22}(?:/(?:videos|shorts|streams|playlists|community|posts|about))?\z}) ||
                   path.matches?(%r{\A/clip/IVCL[A-Za-z0-9_-]+\z})
    nil
  rescue
    nil
  end

  def actions(env) : Array(Tuple(String, String))
    return [{"error_instance_settings", "/admin/settings"}] if Desktop.api_only?
    path = env.request.path
    actions = [] of Tuple(String, String)
    if embedded?(env)
      id = path.lchop("/embed/")
      actions << {"error_open_watch", "/watch?v=#{id}"} if id.matches?(/\A[A-Za-z0-9_-]{11}\z/)
    elsif retry = retry_url(env)
      actions << {"error_try_again", retry}
      if path == "/watch"
        actions << {"Switch Invidious Instance", "/redirect?referer=#{URI.encode_www_form(retry)}"}
        actions << {"next_steps_error_message_go_to_youtube", "https://www.youtube.com#{retry}"}
      end
    end
    if path.includes?("playlist") || path == "/mix"
      actions << {"error_check_playlists", "/feed/playlists"}
    elsif {"/token_ajax", "/token_manager", "/authorize_token"}.includes?(path)
      actions << {"error_review_sessions", "/token_manager"}
    elsif path == "/data_control"
      actions << {"error_review_data", "/data_control"}
    elsif {"/account", "/account/username", "/change_password", "/delete_account"}.includes?(path)
      actions << {"overhaul_account", "/account"}
    elsif path.starts_with?("/preferences") || path == "/blocked_channels" || path == "/dearrow_identity"
      actions << {"overhaul_settings", "/preferences"}
    elsif path.starts_with?("/admin/")
      actions << {"error_instance_settings", "/admin/settings"}
    elsif path == "/login" || path == "/signup" || path == "/signout" || path == "/tv"
      actions << {"Log in", "/login"} if CONFIG.login_enabled
    elsif path == "/create_clip" || path == "/delete_clip"
      actions << {"error_check_clips", "/feed/clips"}
    end
    if {401, 403}.includes?(env.response.status_code) && !env.get?("user") && CONFIG.login_enabled
      actions << {"Log in", "/login"}
    end
    actions << {"error_search_again", "/search"}
    actions.uniq { |action| action[1] }
  end
end

module Invidious::Frontend::Desktop
  extend self

  def api_only? : Bool
    {% if flag?(:api_only) %}
      true
    {% else %}
      false
    {% end %}
  end

  def watch?(env) : Bool
    return false if env.get?("error_page")
    env.request.path == "/watch" || !!env.get?("native_clip_id")
  end

  def embedded?(env) : Bool
    !env.get?("error_page") && env.request.path.starts_with?("/embed/")
  end

  def reading?(env) : Bool
    !!env.get?("error_page") || !!env.get?("message_page") || {"/privacy", "/licenses"}.includes?(env.request.path)
  end

  # Presentation only: retain unknown/native values in the stored preferences.
  def color_mode(preferences : Preferences) : String
    {"light", "dark"}.includes?(preferences.dark_mode) ? preferences.dark_mode : ""
  end

  def settings?(env) : Bool
    env.request.path.starts_with?("/preferences") || {"/blocked_channels", "/dearrow_identity", "/admin/settings"}.includes?(env.request.path)
  end

  def account?(env) : Bool
    return true if env.get?("account_surface")
    {"/login", "/signup", "/account", "/account/username", "/change_password", "/delete_account", "/token_manager", "/authorize_token", "/token_ajax", "/tv", "/data_control"}.includes?(env.request.path)
  end

  # Browser pages share one presentation. Older/native HTML API consumers keep
  # their existing thumbnail/metadata contract unless they request desktop HTML.
  def browser_html?(env) : Bool
    !env.request.path.starts_with?("/api/") || env.get?("desktop_fragment") == true
  end

  def listing?(env) : Bool
    path = env.request.path
    return false if watch?(env) || embedded?(env) || account?(env) || reading?(env)
    return false if env.get?("search_homepage") || settings?(env) || {"/clear_watch_history", "/create_playlist", "/edit_playlist", "/delete_playlist", "/create_clip", "/delete_clip"}.includes?(path) || path.starts_with?("/clip/") || path.starts_with?("/admin/") || path.starts_with?("/post/") || path.ends_with?("/community") || path.ends_with?("/posts")
    browser_html?(env)
  end

  def discovery?(env) : Bool
    return false if reading?(env)
    path = env.request.path
    return true if {"/", "/feed/popular", "/feed/trending"}.includes?(path) || path.starts_with?("/hashtag/")
    path == "/search" && (env.get?("search_scope").try(&.as(String)) || "regular") == "regular"
  end

  def rows?(env) : Bool
    {"/search", "/playlist", "/mix", "/feed/history", "/add_playlist_items"}.includes?(env.request.path) || env.request.path.ends_with?("/search")
  end

  def private_search?(env) : Bool
    search = {"/search", "/add_playlist_items"}.includes?(env.request.path) || env.request.path.ends_with?("/search")
    env.get("preferences").as(Preferences).search_privacy || (search && env.request.method == "POST")
  end

  # Retired browser presentation choices remain in the serialized native model.
  def thin?(env) : Bool
    !browser_html?(env) && env.get("preferences").as(Preferences).thin_mode
  end

  def playlist_cover(raw : String?) : String?
    return nil unless raw
    path = URI.parse(raw).path
    if match = path.match(%r{\A/vi(?:_webp)?/([A-Za-z0-9_-]{11})/})
      "/vi/#{match[1]}/mqdefault.jpg"
    end
  rescue URI::Error
    nil
  end

  def render_item(env, item, item_position = 0)
    locale = env.get("preferences").as(Preferences).locale
    render "src/invidious/views/overhaul/item.ecr"
  end
end

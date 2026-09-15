module Invidious::Frontend::SearchPreferences
  extend self

  MEMBER_COOKIE  = "SEARCH_SHOW_MEMBER_VIDEOS"
  BLOCKED_COOKIE = "SEARCH_INCLUDE_BLOCKED"

  def boolean(value : String?) : Bool?
    case value
    when "1" then true
    when "0" then false
    else          nil
    end
  end

  # Dedicated host-only cookies never enter the account's Preferences object.
  # Normalize duplicate checkbox values (hidden 0 followed by checked 1).
  def apply(env, params : HTTP::Params, default_show : Bool, secure : Bool = false) : Bool
    reset = params["reset_member_videos"]? == "1"
    params.delete_all("reset_member_videos")
    if reset
      params.delete_all("show_member_videos")
      write_cookie(env, MEMBER_COOKIE, "", secure, true)
    end

    { {"show_member_videos", MEMBER_COOKIE}, {"include_blocked", BLOCKED_COOKIE} }.each do |key, name|
      next if reset && key == "show_member_videos"
      explicit = boolean(params.fetch_all(key).last?)
      saved = boolean(env.request.cookies[name]?.try &.value)
      value = explicit.nil? ? saved : explicit
      if !explicit.nil?
        write_cookie(env, name, explicit ? "1" : "0", secure)
      end
      params.delete_all(key)
      params[key] = value ? "1" : "0" unless value.nil?
    end

    override = boolean(params["show_member_videos"]?)
    override.nil? ? default_show : override
  end

  private def write_cookie(env, name : String, value : String, secure : Bool, clear = false)
    env.response.cookies[name] = HTTP::Cookie.new(
      name: name, value: value, path: "/", expires: clear ? Time.unix(0) : Time.utc + 2.years,
      secure: secure, http_only: true, samesite: HTTP::Cookie::SameSite::Lax
    )
  end
end

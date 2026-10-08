require "openssl/hmac"

# Browser profile identifiers describe storage ownership, never authentication.
module Invidious::BrowserProfiles
  extend self

  MARKER = "IV_BROWSER_PROFILE"
  PURGE  = "IV_BROWSER_PURGE"

  def account_scope(email : String) : String
    OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, "browser-profile:v2:#{email}")
  end

  def scope(env) : String
    env.get?("browser_profile").try(&.as(String)) || "guest"
  end

  def render_scope(env) : String
    env.get?("user").try { |user| account_scope(user.as(User).email) } || "guest"
  end

  # The old unsuffixed cookies now belong exclusively to guests.
  def cookie_name(env, name : String) : String
    profile = scope(env)
    profile == "guest" ? name : "#{name}_#{profile}"
  end

  def publish(env, profile : String)
    env.set "browser_profile", profile
    env.response.headers["X-Invidious-Browser-Profile"] = profile
    return if env.request.cookies[MARKER]?.try(&.value) == profile && !env.response.cookies.has_key?(MARKER)
    Authentication.no_store(env)
    env.response.cookies[MARKER] = cookie(env, MARKER, profile)
  end

  def cookie(env, name : String, value : String, clear = false) : HTTP::Cookie
    domain = Authentication.cookie_domain(env)
    HTTP::Cookie.new(name: name, value: value, domain: domain, path: "/",
      expires: clear ? Time.unix(0) : Time.utc + 2.years,
      secure: User::Cookies.secure?(domain), http_only: false, samesite: HTTP::Cookie::SameSite::Lax)
  end

  def delete_profile(env, email : String)
    profile = account_scope(email)
    env.request.cookies.each do |saved|
      if saved.name.ends_with?("_#{profile}") || saved.name.starts_with?("iv_browser_v2_#{profile}_")
        env.response.cookies[saved.name] = cookie(env, saved.name, "", true)
        # Browser-only fallback cookies are host-only.
        env.response.cookies << HTTP::Cookie.new(name: saved.name, value: "", path: "/", expires: Time.unix(0))
      end
    end
    # The next document removes localStorage/sessionStorage for this account.
    env.response.cookies[PURGE] = cookie(env, PURGE, profile)
  end
end

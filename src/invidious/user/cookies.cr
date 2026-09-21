require "http/cookie"

struct Invidious::User
  module Cookies
    extend self

    # Compute per domain: an I2P request must not disable HTTPS cookies elsewhere.
    def secure?(domain : String?) : Bool
      !!(Kemal.config.ssl || CONFIG.https_only) && domain.try(&.split(".").last) != "i2p"
    end

    # Session ID (SID) cookie
    # Parameter "domain" comes from the global config
    def sid(domain : String?, sid) : HTTP::Cookie
      return HTTP::Cookie.new(
        name: "SID",
        domain: domain,
        value: sid,
        expires: Time.utc + 30.days,
        secure: secure?(domain),
        path: "/",
        http_only: true,
        samesite: HTTP::Cookie::SameSite::Lax
      )
    end

    # Preferences (PREFS) cookie
    # Parameter "domain" comes from the global config
    def prefs(domain : String?, preferences : Preferences) : HTTP::Cookie
      return HTTP::Cookie.new(
        name: "PREFS",
        domain: domain,
        value: URI.encode_www_form(preferences.to_json),
        expires: Time.utc + 2.years,
        secure: secure?(domain),
        path: "/",
        http_only: false,
        samesite: HTTP::Cookie::SameSite::Lax
      )
    end
  end
end

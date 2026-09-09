# The only source of theme IDs and asset URLs. Never build URLs from preferences.
module Invidious::Themes
  DEFAULT = "modern-neon"

  record Theme, id : String, name : String, stylesheet : String, preview : String

  AVAILABLE = [
    Theme.new(DEFAULT, "Modern Neon", "/themes/modern-neon/theme.css", "/themes/modern-neon/preview.webp"),
    Theme.new("diary", "Diary", "/themes/diary/theme.css", "/themes/diary/preview.webp"),
    Theme.new("cinematic", "Cinematic", "/themes/cinematic/theme.css", "/themes/cinematic/preview.webp"),
  ]

  def self.resolve(id : String) : Theme
    AVAILABLE.find { |theme| theme.id == id } || AVAILABLE.find! { |theme| theme.id == DEFAULT }
  end

  def self.normalize(id : String) : String
    resolve(id).id
  end

  def self.prepare_schedule(previous : Preferences, updated : Preferences, now = Time.utc.to_unix) : Preferences
    if !updated.theme_random
      updated.theme_random_next_at = nil
    elsif !previous.theme_random || previous.theme_random_interval_hours != updated.theme_random_interval_hours
      updated.theme_random_next_at = now + updated.theme_random_interval_hours.to_i64 * 3600
    end
    updated
  end

  def self.next_mode(mode : String) : String
    case mode
    when ""      then "light"
    when "light" then "dark"
    else              ""
    end
  end

  # Returns new preferences only when the persisted schedule needs updating.
  def self.randomize(preferences : Preferences, now = Time.utc.to_unix, available = AVAILABLE, random = Random.new) : Preferences?
    return unless preferences.theme_random
    updated = preferences
    interval = Preferences::ThemeInterval.normalize(preferences.theme_random_interval_hours).to_i64 * 3600
    deadline = preferences.theme_random_next_at
    if deadline && deadline > 0 && deadline <= now
      candidates = available.reject { |theme| theme.id == preferences.theme }
      updated.theme = candidates.sample(random).id unless candidates.empty?
    elsif deadline && deadline > now && deadline <= now + interval
      return
    end
    updated.theme_random_next_at = now + interval
    updated
  end

  # Only document navigation may advance the schedule; API/media requests cannot.
  def self.document_request?(request : HTTP::Request) : Bool
    return false unless request.method == "GET"
    return false if request.headers["Sec-Fetch-Dest"]?.try { |dest| dest != "document" }
    return false unless request.headers["Accept"]?.try &.includes?("text/html")
    path = request.path
    pages = %w(
      / /watch /playlist /mix /search /results /preferences /privacy /licenses /login
      /data_control /subscription_manager /blocked_channels /create_playlist
      /edit_playlist /delete_playlist /add_playlist_items /change_password
      /delete_account /clear_watch_history /authorize_token /token_manager
      /feed/popular /feed/trending /feed/subscriptions /feed/history /feed/playlists /profile
    )
    return true if pages.includes?(path)
    {"/channel/", "/user/", "/c/", "/@", "/post/", "/profile/", "/hashtag/"}.any? { |prefix| path.starts_with?(prefix) }
  end

  def self.apply_random_theme(env, preferences : Preferences) : Preferences
    return preferences unless document_request?(env.request) && preferences.theme_random
    if user = env.get?("user").try &.as(User)
      # Read the exact stored text, including legacy JSON formatting, for CAS.
      raw = Database::Users.preference_json(user.email)
      saved = Preferences.from_json(raw)
      if updated = randomize(saved)
        saved = Database::Users.compare_and_set_preferences(user.email, raw, updated) ? updated : Preferences.from_json(Database::Users.preference_json(user.email))
      end
      user.preferences = saved
      env.set "user", user
      saved
    elsif updated = randomize(preferences)
      host = env.get?("header_x-forwarded-host")
      domain = CONFIG.alternative_domains.find { |candidate| candidate == host } || CONFIG.domain
      env.response.cookies["PREFS"] = Invidious::User::Cookies.prefs(domain, updated)
      updated
    else
      preferences
    end
  end
end

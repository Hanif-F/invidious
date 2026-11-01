# S16 renders the real routes/error helpers with no network or production data.
def status_surface_env(path, mode, locale = "en-US", method = "GET")
  env = fixture_env(path, mode, locale: locale, method: method)
  user = signed_in_env(path).get("user").as(User)
  user.preferences = env.get("preferences").as(Preferences)
  env.set "user", user
  env.set "csrf_token", "synthetic-status-csrf"
  env.set "sid", "synthetic-status-session"
  env.set "blocked_channels", [] of String
  env
end

def write_status_surface_fixtures(output)
  {"light", "dark", "rtl"}.each do |variant|
    mode, locale = variant == "rtl" ? {"dark", "ar"} : {variant, "en-US"}
    privacy = status_surface_env("/privacy", mode, locale)
    File.write("#{output}/d7-status-privacy-#{variant}.html", Invidious::Routes::Misc.privacy(privacy).as(String))
    licenses = status_surface_env("/licenses", mode, locale)
    html = Invidious::Routes::Misc.licenses(licenses).as(String)
    rows = XML.parse_html(html).xpath_nodes("//table[@id='jslicense-labels1']/tbody/tr")
    raise "License table lost three-column machine semantics" unless rows.size > 40 && rows.all? { |row| row.xpath_nodes("./td/a").size == 3 }
    {"verification.js", "account-forms.js", "overhaul.js", "ui.js", "player.js"}.each do |name|
      raise "License table missing #{name}" unless rows.any? { |row| row.xpath_node("./td/a").try(&.content) == name }
    end
    File.write("#{output}/d7-status-licenses-#{variant}.html", html)
    old_popular = CONFIG.popular_enabled
    begin
      CONFIG.popular_enabled = false
      feed = status_surface_env("/feed/popular", mode, locale)
      File.write("#{output}/d7-status-message-#{variant}.html", Invidious::Routes::Feeds.popular(feed).as(String))
    ensure
      CONFIG.popular_enabled = old_popular
    end
    {
      "unexpected" => {"/watch?v=abcdefghijk&token=private-query-sentinel", "GET", 500},
      "post"       => {"/create_playlist?callback=private-query-sentinel", "POST", 500},
      "search"     => {"/search?token=private-query-sentinel", "POST", 503},
      "embed"      => {"/embed/abcdefghijk?token=private-query-sentinel", "GET", 500},
      "unknown"    => {"/private-path-sentinel/extra?token=private-query-sentinel", "GET", 500},
    }.each do |name, context|
      path, method, status = context
      env = status_surface_env(path, mode, locale, method)
      env.set "search", "private-search-sentinel"
      env.request.headers["Authorization"] = "Bearer private-header-sentinel"
      html = Errors.error_template_helper(env, status, Exception.new("private-exception-sentinel /callback?secret=private-query-sentinel")).as(String)
      %w(private-query-sentinel private-path-sentinel private-search-sentinel private-header-sentinel private-exception-sentinel).each do |secret|
        raise "Public error exposed #{secret}" if html.includes?(secret)
      end
      raise "Error status changed" unless env.response.status_code == status
      raise "Error lost no-store/no-referrer" unless env.response.headers["Cache-Control"] == "private, no-store" && env.response.headers["Referrer-Policy"] == "no-referrer"
      raise "Embedded error lost script-free recovery" if name == "embed" && (html.includes?("<script") || !env.response.headers["Content-Security-Policy"].includes?("frame-ancestors *"))
      File.write("#{output}/d7-status-#{name}-#{variant}.html", html)
    end
    known = status_surface_env("/watch?v=abcdefghijk", mode, locale)
    File.write("#{output}/d7-status-known-#{variant}.html", Errors.error_template_helper(known, 404, InfoException.new(%(Unavailable <img src=x onerror="window.injected=true"> & "quoted"))).as(String))
    unavailable = status_surface_env("/embed/abcdefghijk", mode, locale)
    html = Errors.error_template_helper(unavailable, 404, VideoNotAvailableException.new("This video is unavailable.")).as(String)
    raise "Known unavailable video became an unexpected crash" if html.includes?("error-details") || !html.includes?("This video is unavailable.")
    File.write("#{output}/d7-status-unavailable-#{variant}.html", html)
    missing = status_surface_env("/unknown/missing/page", mode, locale)
    html = Invidious::Routes::ErrorRoutes.error_404(missing).as(String)
    raise "Unknown route no longer reports its actual 404" unless missing.response.status_code == 404 && !missing.response.headers.has_key?("Location")
    File.write("#{output}/d7-status-not-found-#{variant}.html", html)
  end
  early = HTTP::Server::Context.new(HTTP::Request.new("GET", "/unknown/early?password=private-early-sentinel"), HTTP::Server::Response.new(IO::Memory.new))
  html = Errors.error_template_helper(early, 500, Exception.new("private-early-sentinel")).as(String)
  raise "Early exception could not render a private-safe recovery" if html.includes?("private-early-sentinel") || !html.includes?("error-heading")
  unsafe = status_surface_env("/privacy", %q(dark" onload="window.injected=true), %q(en-US" onload="window.injected=true))
  preferences = unsafe.get("preferences").as(Preferences)
  before = preferences.to_json
  html = Invidious::Routes::Misc.privacy(unsafe).as(String)
  raise "Presentation rewrote unknown/native preference fields" unless unsafe.get("preferences").as(Preferences).to_json == before
  raise "Color mode was not allowlisted" unless html.includes?("class=\"no-theme\"")
  File.write("#{output}/d7-status-unsafe-preferences.html", html)
  puts "S16 production reading/error fixtures: legal labels, private-safe diagnostics, ordinary recovery, early errors, escaped preferences and true 404 passed"
end

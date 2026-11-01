# All source choices use the real route and the same seven legacy multipart names.
def write_data_surface_fixtures(output)
  {"light", "dark", "rtl"}.each do |variant|
    mode = variant == "rtl" ? "dark" : variant
    locale = variant == "rtl" ? "ar" : "en-US"
    Invidious::Frontend::DataControl::SOURCES.each do |source, option|
      env = account_surface_env("/data_control?source=#{source}&referer=%2Faccount", mode, locale)
      html = Invidious::Routes::PreferencesRoute.data_control(env).as(String)
      raise "Data page lost privacy" unless env.response.headers["Cache-Control"] == "private, no-store"
      document = XML.parse_html(html)
      fields = document.xpath_nodes("//input[@type='file']")
      raise "Data source did not select exactly one legacy upload field" unless fields.size == 1 && fields[0]["name"] == option[:field]
      File.write("#{output}/d7-data-#{source}-#{variant}.html", html)
    end
    env = account_surface_env("/data_control?source=unsupported&referer=%2Faccount", mode, locale)
    File.write("#{output}/d7-data-unknown-#{variant}.html", Invidious::Routes::PreferencesRoute.data_control(env).as(String))
    failed = account_surface_env("/data_control?source=youtube&referer=%2Faccount", mode, locale)
    File.write("#{output}/d7-data-failed-#{variant}.html", Invidious::Routes::PreferencesRoute.data_control(failed, "Invalid subscription file uploaded").as(String))
    partial = account_surface_env("/data_control?source=youtube-history", mode, locale)
    File.write("#{output}/d7-data-partial-#{variant}.html", Invidious::Routes::PreferencesRoute.data_control(partial, "Import could not be completed. Check your imported data before trying again.").as(String))
  end
end

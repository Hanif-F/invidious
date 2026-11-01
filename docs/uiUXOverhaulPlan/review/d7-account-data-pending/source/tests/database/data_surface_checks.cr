# D7 ordinary import/export pages retain production portable formats and CSRF.
def check_data_surfaces
  old_login = CONFIG.login_enabled
  CONFIG.login_enabled = true
  password = "disposable data form password"
  sid = Invidious::Database::Accounts.register("DataSurface", password, Preferences.from_json("{}"))
  email = Invidious::Database::SessionIDs.select_email(sid).not_nil!
  sources = Invidious::Frontend::DataControl::SOURCES
  sources.each do |source, item|
    page = security_request("GET", "/data_control?source=#{source}", sid)
    html = XML.parse_html(page.get("test_result").as(String))
    check(page.response.headers["Cache-Control"] == "private, no-store", "Data form is cacheable")
    fields = html.xpath_nodes("//input[@type='file']")
    check(fields.size == 1 && fields.first["name"] == item[:field], "Data form changed legacy multipart name")
    check(html.xpath_node("//form[@enctype='multipart/form-data']/input[1]").not_nil!["name"] == "csrf_token", "Upload authorization no longer precedes files")
  end
  unknown = security_request("GET", "/data_control?source=%3Cinvalid%3E", sid)
  check(XML.parse_html(unknown.get("test_result").as(String)).xpath_node("//input[@type='file']").not_nil!["name"] == "import_invidious", "Unknown data source did not fall back safely")
  check(security_request("GET", "/data_control").response.status_code == 302, "Guest can view private import controls")
  boundary = "data-surface-disposable-boundary"
  csrf = generate_response(sid, {"POST:data_control"}, HMAC_KEY)
  token_part = "--#{boundary}\r\nContent-Disposition: form-data; name=\"csrf_token\"\r\n\r\n#{csrf}\r\n"
  upload = ->(name : String, filename : String, type : String, data : String) {
    "--#{boundary}\r\nContent-Disposition: form-data; name=\"#{name}\"; filename=\"#{filename}\"\r\nContent-Type: #{type}\r\n\r\n#{data}\r\n"
  }
  close = "--#{boundary}--\r\n"
  body = token_part + upload.call("import_youtube", "unsupported.txt", "text/plain", "unsupported") + close
  failed = security_request("POST", "/data_control?source=youtube&referer=%2Faccount", sid, body: body, content_type: "multipart/form-data; boundary=#{boundary}")
  check(failed.response.status_code == 415, "Unsupported source file did not retain 415")
  html = XML.parse_html(failed.get("test_result").as(String))
  check(html.xpath_node("//input[@type='file']").not_nil!["name"] == "import_youtube" && html.xpath_node("//*[@role='alert']").not_nil!.content.includes?("Earlier parts"), "Rejected import lost source or partial-write guidance")
  before = Invidious::Database::Users.select!(email: email).preferences.to_json
  import_part = upload.call("import_invidious", "data.json", "application/json", %({"preferences":{"dark_mode":"light"}}))
  denied = security_request("POST", "/data_control?source=invidious", sid, body: import_part + token_part + close, content_type: "multipart/form-data; boundary=#{boundary}")
  check(denied.response.status_code == 403 && Invidious::Database::Users.select!(email: email).preferences.to_json == before, "File-first import bypassed CSRF")
  imported = security_request("POST", "/data_control?source=invidious&referer=%2Faccount", sid, body: token_part + import_part + close, content_type: "multipart/form-data; boundary=#{boundary}")
  check(imported.response.status_code == 302 && imported.response.headers["Location"] == "/account", "Ordinary import redirect contract changed")
  check(Invidious::Database::Users.select!(email: email).preferences.dark_mode == "light", "Ordinary import did not apply supported preferences")
  private_input = "private-upload-value-that-must-not-appear"
  partial_body = token_part + upload.call("import_invidious", "data.json", "application/json", %({"preferences":{"dark_mode":"dark"}})) + upload.call("import_youtube_wh", "history.json", "application/json", "{#{private_input}") + close
  partial = security_request("POST", "/data_control?source=youtube-history", sid, body: partial_body, content_type: "multipart/form-data; boundary=#{boundary}")
  partial_html = partial.get("test_result").as(String)
  check(partial.response.status_code == 500 && !partial_html.includes?(private_input), "Failed parser input leaked or lost failure status")
  check(partial_html.includes?("Earlier parts") && XML.parse_html(partial_html).xpath_node("//input[@type='file']").not_nil!["name"] == "import_youtube_wh", "Partial failure lost source or truthful guidance")
  check(Invidious::Database::Users.select!(email: email).preferences.dark_mode == "dark", "Partial import test did not preserve earlier committed section")
  # No subscriptions or playlist videos are supplied, so these checks need no provider.
  {"json", "rss", "newpipe"}.each do |format|
    result = security_request("GET", "/subscription_manager?action_takeout=1&format=#{format}", sid)
    check(result.response.status_code == 200 && result.response.headers["content-disposition"] == "attachment", "Grouped export link stopped downloading")
    check(result.response.headers["Cache-Control"] == "private, no-store", "Private export can be cached")
    output = result.get("test_result").as(String)
    if format == "json"
      data = JSON.parse(output)
      check(data["preferences"]["dark_mode"] == "dark", "Portable JSON lost imported preference")
      %w(password sessions token accessToken dearrow_identity clips blocked_channels saved_playlists).each { |field| check(!data.as_h.has_key?(field), "Portable JSON gained private/unsupported field") }
    else
      check(XML.parse(output).xpath_node("/opml/body"), "Subscription export lost OPML format")
    end
  end
  puts "D7 data surfaces passed: seven legacy source fields, private source/error pages, CSRF-before-file, ordinary import and unchanged JSON/OPML exports"
ensure
  CONFIG.login_enabled = old_login unless old_login.nil?
end

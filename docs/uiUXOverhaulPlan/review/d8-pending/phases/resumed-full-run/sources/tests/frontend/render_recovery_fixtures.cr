# Render API-only recovery HTML with production templates and no database/provider IO.
# Compile with -Dapi_only; this small harness deliberately has no content fixtures.
require "digest/md5"
require "file_utils"

# Require kemal, then our own overrides
require "kemal"
require "../../src/ext/kemal_static_file_handler.cr"

require "http_proxy"
require "athena-negotiation"
require "openssl/hmac"
require "option_parser"
require "sqlite3"
require "xml"
require "yaml"
require "compress/zip"
require "protodec/utils"

require "../../src/invidious/database/*"
require "../../src/invidious/database/migrations/*"
require "../../src/invidious/http_server/*"
require "../../src/invidious/helpers/*"
require "../../src/invidious/yt_backend/*"
require "../../src/invidious/frontend/*"
require "../../src/invidious/videos/*"

require "../../src/invidious/jsonify/**"

require "../../src/invidious/*"
require "../../src/invidious/comments/*"
require "../../src/invidious/channels/*"
require "../../src/invidious/user/*"
require "../../src/invidious/search/*"
require "../../src/invidious/routes/**"
require "../../src/invidious/jobs/base_job"
require "../../src/invidious/jobs/*"

# Declare the base namespace for invidious
module Invidious
end

# Simple alias to make code easier to read
alias IV = Invidious

include Invidious

add_context_storage_type(Array(String))
add_context_storage_type(Preferences)
add_context_storage_type(Invidious::User)

NOTIFICATION_CHANNEL = ::Channel(VideoNotification).new(32)
CONFIG               = Config.from_yaml("hmac_key: frontend-fixtures\n")
HMAC_KEY             = "frontend-fixtures"
PG_DB                = DB.open("sqlite3::memory:")
HOST_URL             = "https://invidious.test"
MAX_ITEMS_PER_PAGE   = 1500
CURRENT_BRANCH       = "fixture"
CURRENT_COMMIT       = "fixture"
CURRENT_VERSION      = "fixture"
CURRENT_TAG          = ""
ASSET_COMMIT         = "fixture"
SOFTWARE             = {"version" => "fixture", "branch" => "fixture"}
OUTPUT               = File.open(File::NULL, "w")
LOGGER               = Invidious::LogHandler.new(OUTPUT, LogLevel::Off)
YT_POOL              = YoutubeConnectionPool.new(URI.parse("https://www.youtube.com"), capacity: 1)
GGPHT_POOL           = YoutubeConnectionPool.new(URI.parse("https://yt3.ggpht.com"), capacity: 1)
COMPANION_POOL       = CompanionConnectionPool.new(capacity: 1)

{% unless flag?(:api_only) %}
  abort "Compile the recovery renderer with -Dapi_only"
{% end %}

def recovery_env(path, mode)
  env = HTTP::Server::Context.new(HTTP::Request.new("GET", path), HTTP::Server::Response.new(IO::Memory.new))
  env.set "preferences", Preferences.from_json({"dark_mode" => mode}.to_json)
  env.set "current_page", path
  env
end

output = "tests/frontend/.generated"
Dir.mkdir_p(output)
{"light", "dark"}.each do |mode|
  env = recovery_env("/login?referer=%2Fadmin%2Fbot-protection", mode)
  html = Invidious::Routes::Login.login_page(env).as(String)
  raise "API-only login retained unavailable application navigation" if html.includes?("app-sidebar") || html.includes?("href=\"/signup")
  raise "API-only login lost ordinary form or duplicate guard" unless html.includes?("data-account-form") && html.includes?("account-forms.js")
  raise "API-only login lost private response" unless env.response.headers["Cache-Control"] == "private, no-store"
  File.write("#{output}/d7-api-login-#{mode}.html", html)
  default_env = recovery_env("/login", mode)
  raise "API-only default return is unavailable" unless Invidious::Authentication.login_referer(default_env) == "/admin/settings"
  native = true
  policy = Invidious::BotProtection::Settings.new(false, 12, 1_i64)
  ready = false
  destination = "/admin/settings"
  html = render "src/invidious/views/verification.ecr"
  raise "API-only verification offers an unavailable Privacy route" if html.includes?("href=\"/privacy")
  File.write("#{output}/d7-api-verify-#{mode}.html", html)
  error_env = recovery_env("/api/private-sentinel?token=private-sentinel", mode)
  html = error_template_helper(error_env, 500, Exception.new("private-sentinel")).as(String)
  raise "API-only error exposed a credential or unavailable browsing action" if html.includes?("private-sentinel") || html.includes?("href=\"/search") || html.includes?("app-sidebar")
  raise "API-only error lost its useful recovery destination" unless html.includes?("href=\"/admin/settings")
  File.write("#{output}/d7-api-error-#{mode}.html", html)
end
puts "API-only recovery login/verification: minimal forms, native metadata, private headers and valid recovery destinations passed"

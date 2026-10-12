# Isolated preflight check: compile and run with -Dapi_only. No database access.
require "http/server"
require "json"
require "../src/invidious/user/authentication"
require "../src/invidious/routes/api/v1/tv_pairing"

struct PairingAvailabilityConfig
  property login_enabled = true
end

CONFIG   = PairingAvailabilityConfig.new
HOST_URL = "https://invidious.test"

{% unless flag?(:api_only) %}
  {% raise "Run this check with -Dapi_only" %}
{% end %}

env = HTTP::Server::Context.new(HTTP::Request.new("POST", "/api/v1/tv/pairing/start"), HTTP::Server::Response.new(IO::Memory.new))
result = Invidious::Routes::API::V1::TvPairing.unavailable(env)
raise "API-only build issued a usable pairing response" unless env.response.status_code == 503 && JSON.parse(result.not_nil!)["error"] == "pairing_unavailable"
raise "API-only response may be cached" unless env.response.headers["Cache-Control"] == "private, no-store"
puts "API-only pairing preflight returns no-store 503 without database access"

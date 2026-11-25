module Invidious::Routes::Companion
  extend self

  # GET /companion
  def get_companion(env)
    if env.request.method == "GET" && env.request.path == "/companion/videoplayback" &&
       CONFIG.invidious_companion.any?(&.builtin_proxy) &&
       env.params.query["enc"]? != "true" && !env.params.query.has_key?("ump")
      return VideoPlayback.get_video_playback(env)
    end

    proxy_companion(env, "GET")
  end

  # POST /companion
  def post_companion(env)
    proxy_companion(env, "POST")
  end

  # OPTIONS /companion
  def options_companion(env)
    proxy_companion(env, "OPTIONS")
  end

  private def proxy_companion(env, method)
    response_received = false
    stream_error = nil
    COMPANION_POOL.client do |wrapper|
      headers = Authentication.proxy_headers(env)
      body = env.request.body if method == "POST"
      wrapper.client.exec(method, env.request.resource, headers, body) do |response|
        response_received = true
        begin
          env.response.status_code = response.status_code
          response.headers.each { |key, value| env.response.headers[key] = value }
          IO.copy(response.body_io, env.response)
        rescue ex
          # The pool retries exceptions from its block. An interrupted response
          # must terminate the stream without replaying the request.
          wrapper.close
          stream_error = ex
        end
      end
    end
    raise stream_error if stream_error
  rescue ex
    raise ex if response_received

    Errors.error_json(502, "Couldn't proxy request to Invidious Companion.")
  end
end

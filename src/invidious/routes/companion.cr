module Invidious::Routes::Companion
  # GET /companion
  def self.get_companion(env)
    url = env.request.path
    if env.request.query
      url += "?#{env.request.query}"
    end

    begin
      COMPANION_POOL.client do |wrapper|
        wrapper.client.get(url, Authentication.proxy_headers(env)) do |resp|
          return self.proxy_companion(env, resp)
        end
      end
    rescue
    end
  end

  # POST /companion
  def self.post_companion(env)
    url = env.request.path
    if env.request.query
      url += "?#{env.request.query}"
    end

    begin
      COMPANION_POOL.client do |wrapper|
        wrapper.client.post(url, Authentication.proxy_headers(env), env.request.body) do |resp|
          return self.proxy_companion(env, resp)
        end
      end
    rescue
    end
  end

  def self.options_companion(env)
    url = env.request.path
    if env.request.query
      url += "?#{env.request.query}"
    end

    begin
      COMPANION_POOL.client do |wrapper|
        wrapper.client.options(url, Authentication.proxy_headers(env)) do |resp|
          return self.proxy_companion(env, resp)
        end
      end
    rescue
    end
  end

  private def self.proxy_companion(env, response)
    env.response.status_code = response.status_code
    response.headers.each do |key, value|
      env.response.headers[key] = value
    end

    return IO.copy response.body_io, env.response
  end
end

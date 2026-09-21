require "uri"

module Invidious::HttpServer
  module Utils
    extend self

    # Match the whole hostname, not a URL containing an allowed hostname.
    def video_host?(host : String) : Bool
      host.bytesize <= 253 && host.matches?(/\A[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:googlevideo|c\.youtube)\.com\z/)
    end

    def video_uri?(url : URI) : Bool
      host = url.host
      !!(host && video_host?(host) && url.scheme == "https" &&
        url.user.nil? && url.password.nil? && url.fragment.nil? &&
        (url.port.nil? || url.port == 443))
    end

    def proxy_video_url(raw_url : String, *, region : String? = nil, absolute : Bool = false)
      url = URI.parse(raw_url)

      # Add some URL parameters
      params = url.query_params
      params["host"] = url.host.not_nil! # Should never be nil, in theory
      params["region"] = region if !region.nil?
      url.query_params = params

      if absolute
        return "#{HOST_URL}#{url.request_target}"
      else
        return url.request_target
      end
    end

    def add_params_to_url(url : String | URI, params : URI::Params) : URI
      url = URI.parse(url) if url.is_a?(String)

      url_query = url.query || ""

      # Append the parameters
      url.query = String.build do |str|
        if !url_query.empty?
          str << url_query
          str << '&'
        end

        str << params
      end

      return url
    end
  end
end

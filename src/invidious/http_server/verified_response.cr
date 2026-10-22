# Streaming proxies copy upstream headers after the gate runs. Enforce the cache
# boundary when headers are actually sent, including byte-range responses.
class HTTP::Server::Response
  property verification_protected : Bool = false

  protected def write_headers
    if @verification_protected
      headers["Cache-Control"] = "private, no-store"
      headers["Pragma"] = "no-cache"
      vary = headers["Vary"]? || ""
      headers.add("Vary", "Cookie, X-Invidious-Verification") unless vary.includes?("X-Invidious-Verification")
    end
    previous_def
  end
end

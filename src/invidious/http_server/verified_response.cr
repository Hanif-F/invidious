# Streaming proxies copy upstream headers after the gate runs. Enforce the cache
# boundary when headers are actually sent, including byte-range responses.
class HTTP::Server::Response
  property verification_protected : Bool = false
  property login_protected : Bool = false

  protected def write_headers
    if @verification_protected || @login_protected
      headers["Cache-Control"] = "private, no-store"
      headers["Pragma"] = "no-cache"
      vary = (headers["Vary"]? || "").split(',').map(&.strip)
      required = ["Cookie"]
      required << "X-Invidious-Verification" if @verification_protected
      required << "Authorization" if @login_protected
      required.each { |name| vary << name unless vary.any?(&.compare(name, case_insensitive: true).zero?) }
      headers["Vary"] = vary.reject(&.empty?).join(", ")
    end
    previous_def
  end
end

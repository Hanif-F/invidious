{% skip_file if flag?(:api_only) %}

module Invidious::Routes::DeArrowContributions
  # Read a bounded form directly: do not buffer an unbounded/chunked credential body.
  def self.form(env)
    env.response.headers["Cache-Control"] = "no-store"
    user = env.get?("user").try &.as(User)
    sid = env.get?("sid").try &.as(String)
    raise DeArrow::ContributionError.new(403, "Sign in to contribute to DeArrow.") unless user && sid
    raise DeArrow::ContributionError.new(415, "Expected form data") unless env.request.headers["Content-Type"]?.try(&.starts_with?("application/x-www-form-urlencoded"))
    buffer = Bytes.new(8193)
    size = 0
    if body = env.request.body
      while size < buffer.size
        count = body.read(buffer[size..])
        break if count == 0
        size += count
      end
    end
    raw = String.new(buffer[0, size])
    raise DeArrow::ContributionError.new(413, "Request too large") if raw.bytesize > 8192
    params = URI::Params.parse(raw)
    begin
      validate_request(params["csrf_token"]?, sid, env.request, HMAC_KEY)
    rescue
      raise DeArrow::ContributionError.new(403, "Your session expired. Reload the page and try again.")
    end
    DeArrow::AccountContributions.require_storage
    {user, params}
  end

  def self.submit(env, client = DeArrow::CONTRIBUTIONS)
    env.response.content_type = "application/json"
    user, params = form(env)
    DeArrow::AccountContributions.submit(user.email, params["video_id"]? || "", params["action"]? || "",
      params["title"]? || "", params["confirmed"]? == "true", params["uuid"]? || "", params["original"]? == "true", client)
    {ok: true}.to_json
  rescue ex : DeArrow::ContributionError
    env.response.status_code = ex.status
    {error: ex.message}.to_json
  rescue
    env.response.status_code = 502
    {error: "Could not complete the DeArrow action. Refresh before trying again."}.to_json
  end

  def self.identity(env)
    user, params = form(env)
    DeArrow::AccountContributions.import_identity(user.email, params["private_id"]? || "")
    env.redirect "/preferences?dearrow_saved=1#preferences-content"
  rescue ex : DeArrow::ContributionError
    env.response.status_code = ex.status
    env.response.content_type = "text/plain"
    ex.message
  rescue
    env.response.status_code = 500
    env.response.content_type = "text/plain"
    "Could not save the DeArrow identity. Return to Preferences and try again."
  end
end

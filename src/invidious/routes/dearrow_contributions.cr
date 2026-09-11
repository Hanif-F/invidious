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
    unless DeArrow::IdentityCipher.ready?(CONFIG.dearrow_identity_key)
      raise DeArrow::ContributionError.new(503, "The instance administrator must configure DeArrow contribution storage.")
    end
    {user, params}
  end

  def self.submit(env, client = DeArrow::CONTRIBUTIONS)
    env.response.content_type = "application/json"
    user, params = form(env)
    id = params["video_id"]? || ""
    raise DeArrow::ContributionError.new(400, "Invalid video ID") unless DeArrow.valid_id?(id)
    action = params["action"]? || ""
    original = false
    downvote = false
    title = ""
    if action == "submit"
      title = (params["title"]? || "").strip
      if title.empty? || title.size > 110 || title.includes?('\n') || title.includes?('\r') || params["confirmed"]? != "true"
        raise DeArrow::ContributionError.new(400, "Enter a title of at most 110 characters and acknowledge all four guidelines.")
      end
    elsif action == "upvote" || action == "downvote"
      downvote = action == "downvote"
      titles = client.titles(id)
      if params["original"]? == "true"
        original = true
        entry = titles.find(&.original)
        if downvote && (!entry || entry.locked)
          raise DeArrow::ContributionError.new(409, "The original title is not available for downvoting.")
        end
        title = entry ? entry.title : get_video(id).title
      else
        entry = titles.find { |item| item.uuid == params["uuid"]? && !item.original }
        raise DeArrow::ContributionError.new(409, "This submission is no longer available. Refresh the list.") unless entry
        raise DeArrow::ContributionError.new(403, "This title is locked.") if downvote && entry.locked
        title = entry.title
      end
    else
      raise DeArrow::ContributionError.new(400, "Invalid action")
    end
    identity = Database::DeArrowIdentities.identity(user.email, CONFIG.dearrow_identity_key)
    client.submit(id, identity, title, original, downvote, CURRENT_VERSION)
    DeArrow::CLIENT.invalidate(id)
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
    id = (params["private_id"]? || "").strip
    unless id.empty?
      raise DeArrow::ContributionError.new(400, "Enter a private user ID of 30–256 letters, numbers, underscores or hyphens; not a public ID or license key.") unless DeArrow::IdentityCipher.valid_id?(id)
      Database::DeArrowIdentities.import(user.email, id, CONFIG.dearrow_identity_key)
    end
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

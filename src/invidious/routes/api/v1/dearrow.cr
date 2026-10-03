module Invidious::Routes::API::V1::DeArrow
  def self.title(env)
    env.response.content_type = "application/json"
    id = env.params.url["id"]
    unless Invidious::DeArrow.valid_id?(id)
      env.response.status_code = 400
      return {error: "Invalid video ID"}.to_json
    end
    {title: Invidious::DeArrow::CLIENT.title(id)}.to_json
  end

  def self.submissions(env, client = Invidious::DeArrow::CONTRIBUTIONS)
    env.response.content_type = "application/json"
    Invidious::Authentication.no_store(env)
    unless env.get?("user")
      env.response.status_code = 403
      return {error: "Sign in to contribute to DeArrow."}.to_json
    end
    {titles: client.titles(env.params.url["id"])}.to_json
  rescue ex : Invidious::DeArrow::ContributionError
    env.response.status_code = ex.status
    {error: ex.message}.to_json
  end

  def self.identity(env)
    env.response.content_type = "application/json"
    Invidious::Authentication.no_store(env)
    user = env.get("user").as(User)
    {ready:      Invidious::DeArrow::IdentityCipher.ready?(CONFIG.dearrow_identity_key),
     configured: Database::DeArrowIdentities.configured?(user.email)}.to_json
  end

  def self.import_identity(env)
    env.response.content_type = "application/json"
    Invidious::Authentication.no_store(env)
    begin
      data = Mobile.read_json(env)
      raise "Invalid fields" unless data.keys == ["privateId"]
      id = data["privateId"].as_s
    rescue
      return error_json(400, "Expected a privateId string.")
    end
    Invidious::DeArrow::AccountContributions.import_identity(env.get("user").as(User).email, id)
    {ok: true}.to_json
  rescue ex : Invidious::DeArrow::ContributionError
    env.response.status_code = ex.status
    {error: ex.message}.to_json
  rescue
    error_json(500, "Could not save the DeArrow identity.")
  end

  def self.submit(env, client = Invidious::DeArrow::CONTRIBUTIONS)
    env.response.content_type = "application/json"
    Invidious::Authentication.no_store(env)
    begin
      data = Mobile.read_json(env)
      raise "Invalid fields" if data.keys.any? { |key| !{"action", "title", "confirmed", "uuid", "original"}.includes?(key) }
      action = data["action"].as_s
      title = data["title"]?.try(&.as_s) || ""
      uuid = data["uuid"]?.try(&.as_s) || ""
      confirmed = data["confirmed"]?.try(&.as_bool) || false
      original = data["original"]?.try(&.as_bool) || false
    rescue
      return error_json(400, "Invalid DeArrow action. Use JSON booleans for confirmed and original.")
    end
    Invidious::DeArrow::AccountContributions.submit(env.get("user").as(User).email,
      env.params.url["id"], action, title, confirmed, uuid, original, client)
    {ok: true}.to_json
  rescue ex : Invidious::DeArrow::ContributionError
    env.response.status_code = ex.status
    {error: ex.message}.to_json
  rescue
    error_json(502, "Could not complete the DeArrow action. Refresh before trying again.")
  end
end

module Invidious::Routes::API::V1::Clips
  extend self

  def show(env)
    env.response.content_type = "application/json"
    clip = Database::Clips.select(env.params.url["id"])
    return error_json(404, "Clip not found.") unless clip
    clip.to_json
  end

  def channel(env)
    env.response.content_type = "application/json"
    ucid = env.params.url["ucid"]
    return error_json(400, "Invalid channel ID.") unless ucid.matches?(/\AUC[a-zA-Z0-9_-]{22}\z/)
    Database::Clips.list(ucid, owned: false, page: Invidious::Clips.page(env.params.query["page"]?)).to_json
  end

  def index(env)
    env.response.content_type = "application/json"
    user = env.get("user").as(User)
    Database::Clips.list(user.email, owned: true, page: Invidious::Clips.page(env.params.query["page"]?)).to_json
  end

  def create(env)
    env.response.content_type = "application/json"
    user = env.get("user").as(User)
    begin
      data = env.params.json
      clip = Invidious::Clips.create(user, data["videoId"]?.try(&.as?(String)) || "", data["title"]?.try(&.as?(String)) || "",
        data["startTime"]?.try(&.to_s) || "", data["endTime"]?.try(&.to_s) || "")
      env.response.status_code = 201
      env.response.headers["Location"] = "#{HOST_URL}/api/v1/clips/#{clip.id}"
      clip.to_json
    rescue ex : ArgumentError | JSON::ParseException | TypeCastError
      error_json(400, ex)
    rescue ex : NotFoundException
      error_json(404, ex)
    rescue ex
      error_json(500, ex)
    end
  end

  def delete(env)
    env.response.content_type = "application/json"
    user = env.get("user").as(User)
    return error_json(404, "Clip not found.") unless Database::Clips.delete(env.params.url["id"], user.email)
    env.response.status_code = 204
    ""
  end
end

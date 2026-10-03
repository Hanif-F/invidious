module Invidious::Routes::API::V1::BlockedChannels
  def self.index(env)
    env.response.content_type = "application/json"
    user = env.get("user").as(User)
    Database::BlockedChannels.list(user.email).map { |id, name| {authorId: id, author: name} }.to_json
  end

  def self.block(env)
    env.response.content_type = "application/json"
    id = env.params.url["ucid"]
    return error_json(400, "Invalid channel ID.") unless id.matches?(/\AUC[a-zA-Z0-9_-]{22}\z/)
    begin
      data = Mobile.read_json(env)
      raise "Unsupported field" if data.keys.any? { |key| key != "name" }
      name = data["name"]?.try(&.as_s.strip) || ""
    rescue
      return error_json(400, "Invalid channel-blocking request.")
    end
    Database::BlockedChannels.block(env.get("user").as(User).email, id, name.empty? ? id : name[0, 200])
    env.response.status_code = 204
    ""
  end

  def self.unblock(env)
    env.response.content_type = "application/json"
    id = env.params.url["ucid"]
    return error_json(400, "Invalid channel ID.") unless id.matches?(/\AUC[a-zA-Z0-9_-]{22}\z/)
    Database::BlockedChannels.unblock(env.get("user").as(User).email, id)
    env.response.status_code = 204
    ""
  end
end

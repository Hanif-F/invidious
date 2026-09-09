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
end

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

  def self.submissions(env)
    env.response.content_type = "application/json"
    env.response.headers["Cache-Control"] = "no-store"
    unless env.get?("user")
      env.response.status_code = 403
      return {error: "Sign in to contribute to DeArrow."}.to_json
    end
    {titles: Invidious::DeArrow::CONTRIBUTIONS.titles(env.params.url["id"])}.to_json
  rescue ex : Invidious::DeArrow::ContributionError
    env.response.status_code = ex.status
    {error: ex.message}.to_json
  end
end

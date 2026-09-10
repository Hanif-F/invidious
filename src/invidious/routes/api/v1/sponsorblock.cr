module Invidious::Routes::API::V1::SponsorBlock
  def self.segments(env)
    env.response.content_type = "application/json"
    id = env.params.url["id"]
    unless Invidious::SponsorBlock.valid_id?(id)
      env.response.status_code = 400
      return {error: "Invalid video ID"}.to_json
    end
    {segments: Invidious::SponsorBlock::CLIENT.segments(id)}.to_json
  end
end

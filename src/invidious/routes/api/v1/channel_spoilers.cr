require "../../../channel_spoilers"

module Invidious::Routes::API::V1::ChannelSpoilers
  def self.publications(env)
    env.response.content_type = "application/json"
    env.response.headers["Cache-Control"] = "no-store"
    begin
      ids = Invidious::ChannelSpoilers.publication_ids(env.params.query["ids"]?)
    rescue ex : ArgumentError
      return error_json(400, ex.message || "Invalid video IDs")
    end
    dates = Invidious::Database::Videos.select_spoiler_dates(ids)
    {publications: ids.to_h { |id| {id, dates[id]?.try(&.to_unix)} }}.to_json
  end
end

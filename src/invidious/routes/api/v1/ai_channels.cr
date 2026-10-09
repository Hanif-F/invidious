require "../../../ai_slist_api"
require "../../../ai_slist_runtime"

module Invidious::Routes::API::V1::AiChannels
  def self.status(env)
    env.response.content_type = "application/json"
    env.response.headers["Cache-Control"] = "no-store"
    {lists: Invidious::AiSList::Api.status(Invidious::AiSList.runtime.lists)}.to_json
  end

  def self.channels(env)
    env.response.content_type = "application/json"
    env.response.headers["Cache-Control"] = "no-store"
    begin
      ids, kinds = Invidious::AiSList::Api.parameters(env.params.query["ids"]?, env.params.query["lists"]?)
    rescue ex : ArgumentError
      return error_json(400, ex.message || "Invalid AI query")
    end
    runtime = Invidious::AiSList.runtime
    Invidious::AiSList::Api.classify(ids, kinds, runtime.lists, runtime.resolver).to_json
  end
end

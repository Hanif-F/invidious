module Invidious::Frontend::Standalone
  extend self

  # Destination and labels are chosen by the owning route. This shell can render
  # before account/preferences middleware, without reading a policy or provider.
  def notice(env, status : Int32, heading : String, message : String, destination : String, action : String, new_window = false, sign_out = false) : String
    env.response.status_code = status
    env.response.content_type = "text/html; charset=utf-8"
    Authentication.no_store(env)
    env.response.headers["Referrer-Policy"] = "no-referrer"
    render "src/invidious/views/overhaul/standalone_notice.ecr"
  end
end

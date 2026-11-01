# -------------------
#  Issue template
# -------------------

macro error_template(*args)
  error_template_helper(env, {{ args.splat }})
end

def get_issue_template(env : HTTP::Server::Context, exception : Exception) : Tuple(String, String)
  title = "Unexpected #{exception.class} error"
  method = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}.includes?(env.request.method) ? env.request.method : "OTHER"
  details = <<-TEXT
    Date: #{Time::Format::ISO_8601_DATE_TIME.format(Time.utc)}
    Method: #{method}
    Route: #{Invidious::Frontend::ErrorPages.route_pattern(env.request.path)}
    Error type: #{exception.class}
    Version: #{SOFTWARE["version"]} @ #{SOFTWARE["branch"]}
    TEXT
  {title, details}
end

def error_template_helper(env : HTTP::Server::Context, status_code : Int32, exception : Exception)
  if exception.is_a?(InfoException) || exception.is_a?(VideoNotAvailableException)
    return error_template_helper(env, status_code, exception.message || "")
  end
  locale = Invidious::Frontend::ErrorPages.prepare(env)
  env.response.status_code = status_code
  error_heading = I18n.translate(locale, "error_unexpected_heading")
  error_message = I18n.translate(locale, "error_unexpected_message")
  error_diagnostics = get_issue_template(env, exception)[1].as(String?)
  error_actions = Invidious::Frontend::ErrorPages.actions(env)
  if Invidious::Frontend::ErrorPages.embedded?(env)
    env.response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'self'; frame-ancestors *"
    return templated "error", "overhaul/status_shell"
  end
  templated "error"
end

def error_template_helper(env : HTTP::Server::Context, status_code : Int32, message : String)
  locale = Invidious::Frontend::ErrorPages.prepare(env)
  env.response.status_code = status_code
  error_heading = I18n.translate(locale, Invidious::Frontend::ErrorPages.heading_key(env, status_code))
  error_message = I18n.translate(locale, message)
  error_diagnostics = nil.as(String?)
  error_actions = Invidious::Frontend::ErrorPages.actions(env)
  if Invidious::Frontend::ErrorPages.embedded?(env)
    env.response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'self'; frame-ancestors *"
    return templated "error", "overhaul/status_shell"
  end
  templated "error"
end

# -------------------
#  Atom feeds
# -------------------

macro error_atom(*args)
  error_atom_helper(env, {{ args.splat }})
end

def error_atom_helper(env : HTTP::Server::Context, status_code : Int32, exception : Exception)
  if exception.is_a?(InfoException)
    return error_atom_helper(env, status_code, exception.message || "")
  end

  env.response.content_type = "application/atom+xml"
  env.response.status_code = status_code

  return "<error>#{exception.inspect_with_backtrace}</error>"
end

def error_atom_helper(env : HTTP::Server::Context, status_code : Int32, message : String)
  env.response.content_type = "application/atom+xml"
  env.response.status_code = status_code

  return "<error>#{message}</error>"
end

# -------------------
#  JSON
# -------------------

macro error_json(*args)
  error_json_helper(env, {{ args.splat }})
end

def error_json_helper(
  env : HTTP::Server::Context,
  status_code : Int32,
  exception : Exception,
  additional_fields : Hash(String, Object)? = nil,
)
  if exception.is_a?(InfoException)
    return error_json_helper(env, status_code, exception.message || "", additional_fields)
  end

  env.response.content_type = "application/json"
  env.response.status_code = status_code

  error_message = {"error" => exception.message, "errorBacktrace" => exception.inspect_with_backtrace}

  if additional_fields
    error_message = error_message.merge(additional_fields)
  end

  return error_message.to_json
end

def error_json_helper(
  env : HTTP::Server::Context,
  status_code : Int32,
  message : String,
  additional_fields : Hash(String, Object)? = nil,
)
  env.response.content_type = "application/json"
  env.response.status_code = status_code

  error_message = {"error" => message}

  if additional_fields
    error_message = error_message.merge(additional_fields)
  end

  return error_message.to_json
end

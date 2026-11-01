module Invidious::Routes::AdminSettings
  def self.handle(env)
    Authentication.no_store(env)
    unless user = env.get?("user").try(&.as(User))
      return env.redirect("/login?referer=%2Fadmin%2Fsettings", 303)
    end
    unless Authentication.admin?(user)
      env.response.status_code = 403
      return "Administrator access required."
    end
    if env.request.method == "POST"
      unless Authentication.valid_session_csrf?(env)
        env.response.status_code = 403
        return "Invalid CSRF token. Reload this page before saving."
      end
      begin
        Invidious::AdminSettings.save(env.params.body)
        return env.redirect("/admin/settings?saved=1", 303)
      rescue ex : Invidious::AdminSettings::Invalid
        env.response.status_code = 400
        env.set "admin_error", ex.message.to_s
      rescue ex : Invidious::AdminSettings::Stale
        env.response.status_code = 409
        env.set "admin_error", ex.message.to_s
      rescue ex : Invidious::AdminSettings::Unavailable
        env.response.status_code = 503
        env.set "admin_error", ex.message.to_s
      end
      env.set "admin_draft", env.params.body.to_s
    end
    begin
      doc = Invidious::AdminSettings.document
      revision = Invidious::AdminSettings.revision(doc)
      values = Invidious::AdminSettings.configured(doc)
    rescue
      revision = ""
      values = Invidious::AdminSettings.current
    end
    env.set "admin_revision", revision
    env.set "admin_values", values.to_json
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale
    env.response.content_type = "text/html; charset=utf-8"
    {% if flag?(:api_only) %}
      templated "admin/settings", "admin/standalone_shell"
    {% else %}
      templated "admin/settings", "overhaul/shell"
    {% end %}
  end
end

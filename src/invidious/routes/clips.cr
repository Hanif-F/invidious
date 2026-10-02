{% skip_file if flag?(:api_only) %}

module Invidious::Routes::Clips
  extend self

  def login(env)
    env.redirect "/login?referer=#{URI.encode_www_form(env.request.resource)}"
  end

  def index(env)
    Authentication.no_store(env)
    return login(env) unless user = env.get?("user").try(&.as(User))
    locale = env.get("preferences").as(Preferences).locale
    page = Invidious::Clips.page(env.params.query["page"]?)
    clips = Database::Clips.list(user.email, owned: true, page: page, extra: true)
    page_nav_html = Frontend::Pagination.nav_numeric(locale, base_url: "/feed/clips", current_page: page, show_next: clips.size > Invidious::Clips::PAGE_SIZE)
    clips = clips.first(Invidious::Clips::PAGE_SIZE)
    templated "feeds/clips"
  end

  def new_page(env, error : String? = nil)
    Authentication.no_store(env)
    return login(env) unless env.get?("user")
    locale = env.get("preferences").as(Preferences).locale
    values = env.request.method == "POST" ? env.params.body : env.params.query
    video_id = values["videoId"]? || ""
    return error_template(400, "Invalid video ID.") unless validate_video_id(video_id)
    begin
      video = get_video(video_id)
      if message = Invidious::Clips.source_error(video)
        return error_template(400, message)
      end
    rescue ex : NotFoundException
      return error_template(404, ex)
    rescue ex
      return error_template(500, ex)
    end
    title = values["title"]? || ""
    position = values["startTime"]?.try(&.to_f64?) || 0.0
    start_time, end_time = Invidious::Clips::Validation.default_range(position, video.length_seconds)
    if values.has_key?("endTime")
      start_time = position.finite? ? position : 0.0
      end_time = values["endTime"]?.try(&.to_f64?) || end_time
    end
    csrf_token = generate_response(env.get("sid").as(String), {"POST:create_clip"}, HMAC_KEY)
    templated "create_clip"
  end

  def create(env)
    Authentication.no_store(env)
    return login(env) unless user = env.get?("user").try(&.as(User))
    return error_template(403, "Invalid CSRF token") unless Authentication.valid_session_csrf?(env)
    begin
      clip = Invidious::Clips.create(user, env.params.body["videoId"]? || "", env.params.body["title"]? || "",
        env.params.body["startTime"]? || "", env.params.body["endTime"]? || "")
      env.redirect clip.permalink
    rescue ex : ArgumentError
      env.response.status_code = 400
      new_page(env, ex.message)
    rescue ex : NotFoundException
      error_template(404, ex)
    rescue ex
      error_template(500, ex)
    end
  end

  def delete_page(env)
    Authentication.no_store(env)
    return login(env) unless user = env.get?("user").try(&.as(User))
    locale = env.get("preferences").as(Preferences).locale
    clip = Database::Clips.select(env.params.query["id"]? || "")
    return error_template(404, "Clip not found.") unless clip && clip.owner == user.email
    csrf_token = generate_response(env.get("sid").as(String), {"POST:delete_clip"}, HMAC_KEY)
    templated "delete_clip"
  end

  def delete(env)
    Authentication.no_store(env)
    return login(env) unless user = env.get?("user").try(&.as(User))
    return error_template(403, "Invalid CSRF token") unless Authentication.valid_session_csrf?(env)
    return error_template(404, "Clip not found.") unless Database::Clips.delete(env.params.body["id"]? || "", user.email)
    env.redirect "/feed/clips"
  end

  def unavailable(env, clip : InvidiousClip)
    locale = env.get("preferences").as(Preferences).locale
    user = env.get?("user").try(&.as(User))
    env.response.status_code = 503
    templated "clip_unavailable"
  end
end

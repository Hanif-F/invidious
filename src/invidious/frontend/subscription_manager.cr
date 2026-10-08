require "../browser_profiles"

module Invidious::Frontend::SubscriptionManager
  extend self

  SORTS  = %w(alphabetical latest most_watched relevance)
  COOKIE = "SUBSCRIPTION_MANAGER_SORT"

  class Stats
    property latest_upload : Time? = nil
    property fresh_upload : Time? = nil
    getter all_time_watched = 0
    getter recent_watched = 0
    getter habit_weight = 0.0

    # Count each video once, using its latest non-future recorded watch date.
    def record_watch(latest : String?, archived : Array(String), today : Time)
      @all_time_watched += 1
      dates = (archived + [latest].compact).compact_map { |date| Invidious::History.date(date) }
      date = dates.select { |value| value <= today.to_s("%F") }.max?
      return unless date

      age = (today - Time.parse(date, "%F", Time::Location::UTC)).days
      return unless 0 <= age < 90

      @recent_watched += 1
      @habit_weight += 1.0 - age / 90.0
    end

    def relevance(now : Time) : Float64
      freshness = 0.0
      if uploaded = @fresh_upload
        age = (now - uploaded).total_seconds / 1.day.total_seconds
        freshness = 1.0 - age / 7.0 if 0 <= age < 7
      end
      @habit_weight * (1.0 + freshness)
    end
  end

  def preference(env, secure : Bool = false) : String
    explicit = env.params.query.fetch_all("sort_by").last?
    name = BrowserProfiles.cookie_name(env, COOKIE)
    saved = env.request.cookies[name]?.try &.value
    if SORTS.includes?(explicit)
      env.response.cookies[name] = HTTP::Cookie.new(
        name: name, value: explicit.not_nil!, path: "/", expires: Time.utc + 2.years,
        secure: secure, http_only: true, samesite: HTTP::Cookie::SameSite::Lax
      )
      explicit.not_nil!
    else
      SORTS.includes?(saved) ? saved.not_nil! : "alphabetical"
    end
  end

  def sort(channels, stats : Hash(String, Stats), sort_by : String, now : Time)
    channels.sort_by do |channel|
      data = stats[channel.id]? || Stats.new
      rank = case sort_by
             when "latest"       then -(data.latest_upload.try(&.to_unix_f) || -Float64::INFINITY)
             when "most_watched" then -data.all_time_watched.to_f
             when "relevance"    then -data.relevance(now)
             else                     0.0
             end
      {rank, channel.author.downcase, channel.id}
    end
  end
end

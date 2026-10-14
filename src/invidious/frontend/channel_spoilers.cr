require "../channel_spoilers"

add_context_storage_type(Hash(String, Time?))
add_context_storage_type(Time)

module Invidious::Frontend::ChannelSpoilers
  extend self

  record Candidate, id : String, channel : String, published : Time? = nil

  def enabled?(env) : Bool
    !env.get?("user") || !env.get("preferences").as(Preferences).channel_spoiler_settings.empty?
  end

  def cache_enabled?(env) : Bool
    env.get?("user") ? !env.get("preferences").as(Preferences).channel_spoiler_settings.empty? : env.request.cookies.has_key?("iv_spoilers_guest")
  end

  def applies?(env, channel : String, kind : Symbol) : Bool
    return true unless env.get?("user")
    rule = env.get("preferences").as(Preferences).channel_spoiler_settings[channel]?
    !!rule && (kind == :title ? rule.hide_title : rule.hide_thumbnail)
  end

  def now(env) : Time
    if saved = env.get?("spoiler_now")
      saved.as(Time)
    else
      time = Time.utc
      env.set "spoiler_now", time
      time
    end
  end

  def prepare_candidates(env, candidates : Array(Candidate), &lookup : Array(String) -> Hash(String, Time?))
    return unless cache_enabled?(env)
    rules = env.get("preferences").as(Preferences).channel_spoiler_settings
    cached = env.get?("spoiler_dates").try(&.as(Hash(String, Time?))) || {} of String => Time?
    missing = [] of String
    candidates.each do |candidate|
      next if env.get?("user") && !rules.has_key?(candidate.channel)
      if supplied = candidate.published
        cached[candidate.id] = supplied
      elsif !cached.has_key?(candidate.id)
        missing << candidate.id
      end
    end
    missing = missing.uniq.reject { |id| cached.has_key?(id) }
    unless missing.empty?
      begin
        found = yield missing
        missing.each { |id| cached[id] = found[id]? }
      rescue
        missing.each { |id| cached[id] = nil }
      end
    end
    env.set "spoiler_dates", cached
  end

  def prepare_candidates(env, candidates : Array(Candidate))
    prepare_candidates(env, candidates) { |ids| Invidious::Database::Videos.select_spoiler_dates(ids) }
  end

  def prepare(env, items)
    return unless cache_enabled?(env)
    candidates = [] of Candidate
    items.each do |item|
      if item.is_a?(SearchVideo | ChannelVideo | PlaylistVideo | MixVideo)
        candidates << Candidate.new(item.id, item.ucid.to_s, date(item))
      elsif item.is_a?(Invidious::Database::WatchHistory::Entry)
        candidates << Candidate.new(item.video_id, item.channel_id || "", Invidious::ChannelSpoilers.publication(item.release_date))
      elsif item.is_a?(InvidiousClip)
        candidates << Candidate.new(item.video_id, item.ucid)
      end
    end
    prepare_candidates(env, candidates)
  end

  def prepare_recommendations(env, items)
    return unless cache_enabled?(env)
    candidates = [] of Candidate
    items.each do |item|
      if id = item["id"]?
        candidates << Candidate.new(id, item["ucid"]? || "", Invidious::ChannelSpoilers.publication(item["published"]?))
      end
    end
    prepare_candidates(env, candidates)
  end

  def queue_date(video : JSON::Any) : Time?
    video["published"]?.try(&.as_i64?).try { |epoch| Invidious::ChannelSpoilers.publication(Time.unix(epoch)) }
  end

  def prepare_queue(env, videos : Array(JSON::Any))
    return unless cache_enabled?(env)
    prepare_candidates(env, videos.map { |video| Candidate.new(video["videoId"].as_s, video["authorId"]?.try(&.as_s?) || "", queue_date(video)) })
  end

  def date(item) : Time?
    return nil if item.responds_to?(:published_known) && !item.published_known
    item.responds_to?(:published) ? Invidious::ChannelSpoilers.publication(item.published) : nil
  end

  def publication(env, id : String, supplied : Time?) : Time?
    supplied || env.get?("spoiler_dates").try(&.as(Hash(String, Time?))[id]?)
  end

  def hidden?(env, ucid : String, published : Time?, kind : Symbol) : Bool
    rule = env.get("preferences").as(Preferences).channel_spoiler_settings[ucid]?
    !!rule && rule.active?(published, now(env)) && (kind == :title ? rule.hide_title : rule.hide_thumbnail)
  end

  def label(env, kind : Symbol, unknown : Bool) : String
    I18n.translate(env.get("preferences").as(Preferences).locale, "spoilers_#{kind}_hidden#{unknown ? "_unknown" : ""}")
  end

  def attributes(env, id : String, ucid : String, published : Time?, kind : Symbol) : String
    %( data-spoiler-#{kind} data-spoiler-channel="#{HTML.escape(ucid)}" data-spoiler-published="#{published.try(&.to_unix)}" data-spoiler-hidden="#{hidden?(env, ucid, published, kind)}")
  end

  def title(env, id : String, ucid : String, original : String, published : Time?, watch = false, dearrow = true, tag = "span") : String
    base = %( dir="auto"#{dearrow ? " data-dearrow-id=\"#{HTML.escape(id)}\"" : ""}#{watch ? " data-dearrow-watch" : ""})
    return %(<#{tag}#{base}>#{HTML.escape(original)}</#{tag}>) unless applies?(env, ucid, :title)
    date = publication(env, id, published)
    hidden = hidden?(env, ucid, date, :title)
    text = hidden ? label(env, :title, date.nil?) : original
    %(<#{tag}#{base}#{attributes(env, id, ucid, date, :title)} data-spoiler-original="#{HTML.escape(original)}">#{HTML.escape(text)}</#{tag}>)
  end

  def thumbnail(env, id : String, ucid : String, published : Time?, normal : String, url = "/vi/#{id}/mqdefault.jpg") : String
    return normal unless applies?(env, ucid, :thumbnail)
    date = publication(env, id, published)
    hidden = hidden?(env, ucid, date, :thumbnail)
    content = hidden ? %(<span class="spoiler-placeholder">#{HTML.escape(label(env, :thumbnail, date.nil?))}</span>) : normal
    %(<span class="spoiler-thumbnail"#{attributes(env, id, ucid, date, :thumbnail)} data-spoiler-original="#{HTML.escape(url)}">#{content}</span>)
  end

  def config(env) : String
    preferences = env.get("preferences").as(Preferences)
    rules = {} of String => NamedTuple(hide_title: Bool, hide_thumbnail: Bool, reveal_after_days: Int32?)
    if env.get?("user")
      preferences.channel_spoiler_settings.each do |id, rule|
        rules[id] = {hide_title: rule.hide_title, hide_thumbnail: rule.hide_thumbnail, reveal_after_days: rule.reveal_after_days}
      end
    end
    {
      "rules"   => rules,
      "now"     => now(env).to_unix,
      "dearrow" => preferences.dearrow_enabled,
      "page"    => JSON.parse(env.get?("spoiler_page").try(&.as(String)) || "null"),
      "labels"  => %w(title_hidden title_hidden_unknown thumbnail_hidden thumbnail_hidden_unknown reveal_title reveal_thumbnail hide_title next_original next_dearrow loading).to_h { |key| {key, I18n.translate(preferences.locale, "spoilers_#{key}")} },
    }.to_json.gsub("<", "\\u003c")
  end
end

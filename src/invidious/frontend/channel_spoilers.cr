require "../channel_spoilers"

add_context_storage_type(Hash(String, JSON::Any))
add_context_storage_type(Time)

module Invidious::Frontend::ChannelSpoilers
  extend self

  def now(env) : Time
    if saved = env.get?("spoiler_now")
      saved.as(Time)
    else
      time = Time.utc
      env.set "spoiler_now", time
      time
    end
  end

  def prepare_ids(env, ids : Array(String))
    preferences = env.get("preferences").as(Preferences)
    return if preferences.channel_spoiler_settings.empty? && !env.request.cookies.has_key?("iv_spoilers_guest")
    cached = env.get?("spoiler_metadata").try(&.as(Hash(String, JSON::Any))) || {} of String => JSON::Any
    missing = ids.uniq.reject { |id| cached.has_key?(id) }
    unless missing.empty?
      begin
        found = Invidious::Database::Videos.select_spoiler_metadata(missing)
        missing.each { |id| cached[id] = found[id]? || JSON::Any.new(nil) }
      rescue
        missing.each { |id| cached[id] = JSON::Any.new(nil) }
      end
    end
    env.set "spoiler_metadata", cached
  end

  def prepare(env, items)
    ids = [] of String
    items.each do |item|
      ids << item.id if item.is_a?(SearchVideo | ChannelVideo | PlaylistVideo | MixVideo)
    end
    prepare_ids(env, ids)
  end

  def date(item) : Time?
    return nil if item.responds_to?(:published_known) && !item.published_known
    item.responds_to?(:published) ? Invidious::ChannelSpoilers.publication(item.published) : nil
  end

  def publication(env, id : String, supplied : Time?) : Time?
    supplied || env.get?("spoiler_metadata").try(&.as(Hash(String, JSON::Any))[id]?.try(&.as_h?)).try { |info| Invidious::ChannelSpoilers.video_publication(info) }
  end

  def hidden?(env, ucid : String, published : Time?, kind : Symbol) : Bool
    rule = env.get("preferences").as(Preferences).channel_spoiler_settings[ucid]?
    !!rule && rule.active?(published, now(env)) && (kind == :title ? rule.hide_title : rule.hide_thumbnail)
  end

  def label(env, kind : Symbol, unknown : Bool) : String
    I18n.translate(env.get("preferences").as(Preferences).locale, "spoilers_#{kind}_hidden#{unknown ? "_unknown" : ""}")
  end

  def attributes(env, id : String, ucid : String, published : Time?, kind : Symbol) : String
    date = publication(env, id, published)
    %( data-spoiler-#{kind} data-spoiler-channel="#{HTML.escape(ucid)}" data-spoiler-published="#{date.try(&.to_unix)}" data-spoiler-hidden="#{hidden?(env, ucid, date, kind)}")
  end

  def title(env, id : String, ucid : String, original : String, published : Time?, watch = false, dearrow = true, tag = "span") : String
    date = publication(env, id, published)
    hidden = hidden?(env, ucid, date, :title)
    text = hidden ? label(env, :title, date.nil?) : original
    %(<#{tag} dir="auto"#{dearrow ? " data-dearrow-id=\"#{HTML.escape(id)}\"" : ""}#{watch ? " data-dearrow-watch" : ""}#{attributes(env, id, ucid, date, :title)} data-spoiler-original="#{HTML.escape(original)}">#{HTML.escape(text)}</#{tag}>)
  end

  def thumbnail(env, id : String, ucid : String, published : Time?, normal : String, url = "/vi/#{id}/mqdefault.jpg") : String
    date = publication(env, id, published)
    hidden = hidden?(env, ucid, date, :thumbnail)
    content = hidden ? %(<span class="spoiler-placeholder">#{HTML.escape(label(env, :thumbnail, date.nil?))}</span>) : normal
    %(<span class="spoiler-thumbnail"#{attributes(env, id, ucid, date, :thumbnail)} data-spoiler-original="#{HTML.escape(url)}">#{content}</span>)
  end

  def config(env) : String
    preferences = env.get("preferences").as(Preferences)
    {
      "rules"   => env.get?("user") ? preferences.channel_spoiler_settings : {} of String => Invidious::ChannelSpoilers::Rule,
      "now"     => now(env).to_unix,
      "dearrow" => preferences.dearrow_enabled,
      "page"    => JSON.parse(env.get?("spoiler_page").try(&.as(String)) || "null"),
      "labels"  => %w(title_hidden title_hidden_unknown thumbnail_hidden thumbnail_hidden_unknown reveal_title reveal_thumbnail hide_title next_original next_dearrow loading).to_h { |key| {key, I18n.translate(preferences.locale, "spoilers_#{key}")} },
    }.to_json.gsub("<", "\\u003c")
  end
end

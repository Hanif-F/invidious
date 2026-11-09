require "html"
require "../helpers/channel_avatars"

add_context_storage_type(Hash(String, String))

module Invidious::Frontend::ChannelAvatars
  extend self

  def prepare(env, items, extra_ids : Array(String) = [] of String)
    Invidious::Frontend::AiChannels.observe(items)
    ids = extra_ids.dup
    supplied = Invidious::ChannelAvatars.from_items(items)
    items.each do |item|
      if item.responds_to?(:ucid)
        id = item.ucid.to_s
        next if id.empty?
        ids << id
      end
    end
    Database::ChannelAvatars.observe(supplied)
    prepare_ids(env, ids, supplied)
  end

  def prepare_ids(env, ids : Array(String), supplied = {} of String => String)
    cached = {} of String => String
    unless Desktop.thin?(env)
      missing = ids.uniq.reject { |id| supplied.has_key?(id) || !show?(env, id) }
      cached = Database::ChannelAvatars.select(missing)
    end
    env.set "channel_avatars", cached.merge(supplied)
  end

  def show?(env, id : String) : Bool
    return false if id.empty? || Desktop.thin?(env)
    owner = env.get?("channel_avatar_owner").try &.as(String)
    owner ||= env.request.path.starts_with?("/channel/") ? env.request.path.split('/')[2]? : nil
    id != owner
  end

  def compact?(env) : Bool
    {"/search", "/playlist", "/mix"}.includes?(env.request.path)
  end

  def render(env, id : String, size : Int32 = 36, name : String? = nil) : String
    return "" unless show?(env, id)
    url = env.get?("channel_avatars").try &.as(Hash(String, String))[id]?
    render_image(name, url, size)
  end

  # Headers already have an avatar URL and must not suppress their own identity.
  # Use the same no-request fallback as listing attribution.
  def render_image(name : String?, url : String?, size : Int32 = 36) : String
    url = Invidious::ChannelAvatars.proxy_url(url)
    initial = Invidious::ChannelAvatars.placeholder_initial(name)
    color = Invidious::ChannelAvatars.placeholder_color(initial)

    String.build do |html|
      html << %(<span class="channel-avatar channel-avatar-#{size} channel-avatar-color-#{color}" aria-hidden="true">)
      html << %(<span class="channel-avatar-initial" dir="auto">#{HTML.escape(initial)}</span>)
      if url
        html << %(<img loading="lazy" decoding="async" width="#{size}" height="#{size}" src="#{HTML.escape(url)}" alt="">)
      end
      html << "</span>"
    end
  end
end

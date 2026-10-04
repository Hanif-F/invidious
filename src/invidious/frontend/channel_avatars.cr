require "html"
require "../helpers/channel_avatars"

add_context_storage_type(Hash(String, String))

module Invidious::Frontend::ChannelAvatars
  extend self

  def prepare(env, items)
    ids = [] of String
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
    unless env.get("preferences").as(Preferences).thin_mode
      missing = ids.uniq.reject { |id| supplied.has_key?(id) || !show?(env, id) }
      cached = Database::ChannelAvatars.select(missing)
    end
    env.set "channel_avatars", cached.merge(supplied)
  end

  def show?(env, id : String) : Bool
    return false if id.empty? || env.get("preferences").as(Preferences).thin_mode
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

require "json"
require "uri"
require "string/grapheme"

module Invidious::ChannelAvatars
  extend self

  def placeholder_initial(name : String?) : String
    return "#" if name.nil?

    name.lstrip.each_grapheme do |glyph|
      initial = glyph.to_s.unicode_normalize
      return "#" unless initial.each_char.first.letter?

      uppercase = initial.upcase
      return uppercase.grapheme_size == 1 ? uppercase : initial
    end
    "#"
  end

  def placeholder_color(initial : String) : Int32
    (initial.each_char.first?.try(&.ord) || '#'.ord) % 6
  end

  # Extract only data already in a listing; this helper has no storage or network effects.
  def from_items(items) : Hash(String, String)
    avatars = {} of String => String
    items.each do |item|
      if item.responds_to?(:ucid) && item.responds_to?(:author_thumbnail)
        id = item.ucid.to_s
        next if id.empty?
        if url = proxy_url(item.author_thumbnail)
          avatars[id] = url
        end
      end
    end
    avatars
  end

  # Modern video cards put the linked author and avatar in lockup metadata.
  def lockup_author(metadata : JSON::Any?) : {String?, String?}
    authors = lockup_authors(metadata)
    return {nil, nil} unless authors.map(&.[1]).uniq.size == 1
    authors.first
  end

  def lockup_thumbnail(metadata : JSON::Any?, channel_id : String) : String?
    return nil if channel_id.empty?
    return nil unless lockup_authors(metadata).all? { |author| author[1] == channel_id }

    avatar = metadata.try &.dig?("image", "decoratedAvatarViewModel")
    avatar_id = avatar.try &.dig?("rendererContext", "commandContext", "onTap", "innertubeCommand", "browseEndpoint", "browseId").try &.as_s?
    return nil if avatar_id && avatar_id != channel_id

    sources = avatar.try &.dig?("avatar", "avatarViewModel", "image", "sources").try &.as_a?
    sources.try &.each do |source|
      url = source.as_h?.try(&.["url"]?).try &.as_s?
      return url if proxy_url(url)
    end
    nil
  rescue
    # Optional avatar data must never discard a video or request metadata.
    nil
  end

  private def lockup_authors(metadata : JSON::Any?) : Array({String, String})
    authors = [] of {String, String}
    rows = metadata.try &.dig?("metadata", "contentMetadataViewModel", "metadataRows").try &.as_a?
    rows.try &.each do |row|
      parts = row.as_h?.try(&.["metadataParts"]?).try &.as_a?
      parts.try &.each do |part|
        text = part.as_h?.try(&.["text"]?)
        name = text.try &.as_h?.try(&.["content"]?).try &.as_s?
        runs = text.try &.as_h?.try(&.["commandRuns"]?).try &.as_a?
        runs.try &.each do |run|
          id = begin
            run.dig?("onTap", "innertubeCommand", "browseEndpoint", "browseId").try &.as_s?
          rescue
            nil
          end
          authors << {name, id} if name && id && id.starts_with?("UC")
        end
      end
    end
    authors
  rescue
    [] of {String, String}
  end

  # Always use the existing fixed-host proxy, never a remote URL in the page.
  # One image size lets the browser reuse a channel's avatar across list layouts.
  def proxy_url(url : String?) : String?
    return nil if url.nil? || url.blank?

    if url.starts_with?("/ggpht/")
      uri = URI.parse(url.lchop("/ggpht"))
    else
      uri = URI.parse(url.starts_with?("//") ? "https:#{url}" : url)
      return nil unless {"https", "http"}.includes?(uri.scheme)
      return nil unless {"yt3.ggpht.com", "yt3.googleusercontent.com"}.includes?(uri.host.try &.downcase)
      return nil if uri.user || uri.password || uri.port
    end

    return nil if uri.path.empty? || uri.path == "/" || uri.path.includes?('\\')
    uri.path = uri.path.gsub(/=s\d+/, "=s88").gsub(/\/s\d+-/, "/s88-")
    "/ggpht#{uri.request_target}"
  rescue URI::Error
    nil
  end
end

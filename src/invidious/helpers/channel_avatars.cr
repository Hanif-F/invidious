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

  def from_video(video) : Hash(String, String)
    avatars = {} of String => String
    video.related_videos.each do |related|
      id = related["ucid"]? || ""
      next if id.empty?
      if url = proxy_url(related["author_thumbnail"]?)
        avatars[id] ||= url
      end
    end
    if url = proxy_url(video.author_thumbnail)
      avatars[video.ucid] = url unless video.ucid.empty?
    end
    avatars
  end

  # Only direct authors in the parsed comments/posts response can supply identity.
  def from_comments(response : JSON::Any) : Hash(String, String)
    avatars = {} of String => String
    comments = response.as_h?.try(&.["comments"]?).try &.as_a?
    comments.try &.each do |item|
      record = item.as_h?
      next unless record
      id = record["authorId"]?.try &.as_s?
      next unless id && id.matches?(/\AUC[A-Za-z0-9_-]{22}\z/)

      url = proxy_url(record["authorThumbnail"]?.try &.as_s?)
      unless url
        sources = record["authorThumbnails"]?.try &.as_a?
        sources.try &.reverse_each do |source|
          url = proxy_url(source.as_h?.try(&.["url"]?).try &.as_s?)
          break if url
        end
      end
      # A malformed duplicate must not erase an earlier valid observation.
      avatars[id] = url if url
    end
    avatars
  end

  # Modern video cards put the linked author and avatar in lockup metadata.
  def lockup_author(metadata : JSON::Any?) : {String?, String?}
    authors = lockup_authors(metadata)
    unless authors.empty?
      return authors.map(&.[1]).uniq.size == 1 ? authors.first : {nil, nil}
    end

    # Watch recommendations link the avatar, but leave the creator label unlinked.
    id = lockup_avatar(metadata).try &.dig?("rendererContext", "commandContext", "onTap", "innertubeCommand", "browseEndpoint", "browseId").try &.as_s?
    return {nil, nil} unless id && id.starts_with?("UC")
    name = lockup_author_label(metadata)
    return {nil, nil} unless name
    {name, id}
  rescue
    {nil, nil}
  end

  def lockup_author_label(metadata : JSON::Any?) : String?
    parts = metadata.try &.dig?("metadata", "contentMetadataViewModel", "metadataRows", 0, "metadataParts").try &.as_a?
    return nil unless parts && parts.size == 1
    text = parts.first.as_h?.try(&.["text"]?).try &.as_h?
    return nil if text.try(&.["commandRuns"]?)
    name = text.try(&.["content"]?).try &.as_s?
    name unless name.try(&.blank?)
  rescue
    nil
  end

  def lockup_thumbnail(metadata : JSON::Any?, channel_id : String) : String?
    return nil if channel_id.empty?
    return nil unless lockup_authors(metadata).all? { |author| author[1] == channel_id }

    avatar = lockup_avatar(metadata)
    avatar_identity = avatar.try &.dig?("rendererContext", "commandContext", "onTap", "innertubeCommand", "browseEndpoint", "browseId")
    return nil if avatar_identity && avatar_identity.as_s? != channel_id

    sources = avatar.try &.dig?("avatar", "avatarViewModel", "image", "sources").try &.as_a?
    thumbnail_url(sources)
  rescue
    # Optional avatar data must never discard a video or request metadata.
    nil
  end

  def related_thumbnail(renderer : JSON::Any, channel_id : String) : String?
    return nil if channel_id.empty?
    {"shortBylineText", "longBylineText"}.each do |key|
      runs = renderer[key]?.try(&.dig?("runs")).try &.as_a?
      next unless runs
      return nil if runs.any? do |run|
                      identity = run.dig?("navigationEndpoint", "browseEndpoint", "browseId")
                      identity && identity.as_s? != channel_id
                    end
    end
    sources = renderer.dig?("channelThumbnail", "thumbnails").try &.as_a?
    thumbnail_url(sources)
  rescue
    nil
  end

  private def lockup_avatar(metadata : JSON::Any?) : JSON::Any?
    image = metadata.try &.dig?("image").try &.as_h?
    return nil if image.try(&.["avatarStackViewModel"]?)
    image.try(&.["decoratedAvatarViewModel"]?)
  rescue
    nil
  end

  private def thumbnail_url(sources : Array(JSON::Any)?) : String?
    sources.try &.each do |source|
      url = source.as_h?.try(&.["url"]?).try &.as_s?
      return url if proxy_url(url)
    end
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

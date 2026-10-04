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

module Invidious::RSS
  extend self

  def subscriptions(ids : Array(String), format : String = "rss") : String
    cached = Database::Channels.select(ids).to_h { |channel| {channel.id, channel} }
    channels = ids.uniq.map do |id|
      cached[id]? || InvidiousChannel.new({id: id, author: id, updated: Time.utc, deleted: false, subscribed: Time.utc})
    end
    opml(channels, format)
  end

  def playlist(playlist : InvidiousPlaylist) : String
    XML.build(indent: "  ", encoding: "UTF-8") do |xml|
      xml.element("feed", xmlns: "http://www.w3.org/2005/Atom", "xmlns:yt": "http://www.youtube.com/xml/schemas/2015",
        "xmlns:iv": "https://invidious.io/xml/schemas/2026", "xmlns:media": "http://search.yahoo.com/mrss/") do
        xml.element("id") { xml.text "iv:playlist:#{playlist.id}" }
        xml.element("iv:playlistId") { xml.text playlist.id }
        xml.element("title") { xml.text playlist.title }
        xml.element("updated") { xml.text playlist.updated.to_rfc3339 }
        xml.element("link", rel: "self", href: "#{HOST_URL}/feed/playlist/#{playlist.id}")
        xml.element("link", rel: "alternate", href: "#{HOST_URL}/playlist?list=#{playlist.id}")
        xml.element("author") { xml.element("name") { xml.text playlist.display_author } }
        get_playlist_videos(playlist, offset: 0).each { |video| video.to_xml(xml) if video.is_a?(PlaylistVideo) }
      end
    end
  end

  def mix(mix : Mix, seed : String) : String
    updated = Time.utc.to_rfc3339
    XML.build(indent: "  ", encoding: "UTF-8") do |xml|
      xml.element("feed", xmlns: "http://www.w3.org/2005/Atom", "xmlns:yt": "http://www.youtube.com/xml/schemas/2015",
        "xmlns:media": "http://search.yahoo.com/mrss/") do
        xml.element("id") { xml.text "yt:mix:#{mix.id}:#{seed}" }
        xml.element("title") { xml.text mix.title }
        xml.element("updated") { xml.text updated }
        xml.element("link", rel: "self", href: "#{HOST_URL}/feed/playlist/#{mix.id}?continuation=#{seed}")
        xml.element("link", rel: "alternate", href: "#{HOST_URL}/mix?list=#{mix.id}&continuation=#{seed}")
        mix.videos.each do |video|
          xml.element("entry") do
            xml.element("id") { xml.text "yt:video:#{video.id}" }
            xml.element("yt:videoId") { xml.text video.id }
            xml.element("yt:channelId") { xml.text video.ucid }
            xml.element("title") { xml.text video.title }
            # This is a snapshot time; mixes do not expose publication dates.
            xml.element("updated") { xml.text updated }
            xml.element("link", rel: "alternate", href: "#{HOST_URL}/watch?v=#{video.id}&list=#{mix.id}")
            xml.element("author") { xml.element("name") { xml.text video.author } }
            xml.element("media:group") do
              xml.element("media:title") { xml.text video.title }
              xml.element("media:thumbnail", url: "#{HOST_URL}/vi/#{video.id}/mqdefault.jpg", width: "320", height: "180")
            end
          end
        end
      end
    end
  end

  def opml(channels : Array(InvidiousChannel), format : String = "rss") : String
    raise InfoException.new("Unsupported OPML format.") unless {"rss", "newpipe"}.includes?(format)
    title = format == "newpipe" ? "YouTube Subscriptions" : "Invidious Subscriptions"
    XML.build(encoding: "UTF-8") do |xml|
      xml.element("opml", version: "1.1") do
        xml.element("body") do
          xml.element("outline", text: title, title: title) do
            channels.sort_by(&.author.downcase).each do |channel|
              url = format == "newpipe" ? "https://www.youtube.com/feeds/videos.xml?channel_id=#{channel.id}" : "#{HOST_URL}/feed/channel/#{channel.id}"
              xml.element("outline", text: channel.author, title: channel.author, "type": "rss", xmlUrl: url)
            end
          end
        end
      end
    end
  end
end

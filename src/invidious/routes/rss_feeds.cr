# RSS feeds are used by the web UI and native clients, including API-only builds.
module Invidious::Routes::Feeds
  def self.rss_channel(env)
    env.response.headers["Content-Type"] = "application/atom+xml"
    env.response.content_type = "application/atom+xml"

    if env.params.url["ucid"].matches?(/^[\w-]+$/)
      ucid = env.params.url["ucid"]
    else
      return error_atom(400, InfoException.new("Invalid channel ucid provided."))
    end

    params = HTTP::Params.parse(env.params.query["params"]? || "")

    namespaces = {
      "yt"      => "http://www.youtube.com/xml/schemas/2015",
      "media"   => "http://search.yahoo.com/mrss/",
      "default" => "http://www.w3.org/2005/Atom",
    }

    response = YT_POOL.client &.get("/feeds/videos.xml?channel_id=#{ucid}")
    return error_atom(404, NotFoundException.new("Channel does not exist.")) if response.status_code == 404
    rss = XML.parse(response.body)

    videos = rss.xpath_nodes("//default:feed/default:entry", namespaces).map do |entry|
      video_id = entry.xpath_node("yt:videoId", namespaces).not_nil!.content
      title = entry.xpath_node("default:title", namespaces).not_nil!.content

      published = Time.parse_rfc3339(entry.xpath_node("default:published", namespaces).not_nil!.content)
      updated = Time.parse_rfc3339(entry.xpath_node("default:updated", namespaces).not_nil!.content)

      author = entry.xpath_node("default:author/default:name", namespaces).not_nil!.content
      video_ucid = entry.xpath_node("yt:channelId", namespaces).not_nil!.content
      description_html = entry.xpath_node("media:group/media:description", namespaces).not_nil!.to_s
      views = entry.xpath_node("media:group/media:community/media:statistics", namespaces).not_nil!.["views"].to_i64

      SearchVideo.new({
        title:              title,
        id:                 video_id,
        author:             author,
        ucid:               video_ucid,
        published:          published,
        views:              views,
        description_html:   description_html,
        length_seconds:     0,
        premiere_timestamp: nil,
        author_verified:    false,
        author_thumbnail:   nil,
        badges:             VideoBadges::None,
      })
    end

    author = ""
    author = videos[0].author if videos.size > 0

    XML.build(indent: "  ", encoding: "UTF-8") do |xml|
      xml.element("feed", "xmlns:yt": "http://www.youtube.com/xml/schemas/2015",
        "xmlns:media": "http://search.yahoo.com/mrss/", xmlns: "http://www.w3.org/2005/Atom",
        "xml:lang": "en-US") do
        xml.element("link", rel: "self", href: "#{HOST_URL}#{env.request.resource}")
        xml.element("id") { xml.text "yt:channel:#{ucid}" }
        xml.element("yt:channelId") { xml.text ucid }
        xml.element("title") { xml.text author }
        xml.element("link", rel: "alternate", href: "#{HOST_URL}/channel/#{ucid}")

        xml.element("author") do
          xml.element("name") { xml.text author }
          xml.element("uri") { xml.text "#{HOST_URL}/channel/#{ucid}" }
        end

        xml.element("image") do
          xml.element("url") { xml.text "" }
          xml.element("title") { xml.text author }
          xml.element("link", rel: "self", href: "#{HOST_URL}#{env.request.resource}")
        end

        videos.each do |video|
          video.to_xml(false, params, xml)
        end
      end
    end
  end

  def self.rss_private(env)
    env.response.headers["Cache-Control"] = "private, no-store"
    locale = env.get("preferences").as(Preferences).locale

    env.response.headers["Content-Type"] = "application/atom+xml"
    env.response.content_type = "application/atom+xml"

    token = env.params.query["token"]?

    if !token
      haltf env, status_code: 403
    end

    user = Invidious::Database::Users.select(token: token.strip)
    if !user
      haltf env, status_code: 403
    end

    max_results = env.params.query["max_results"]?.try &.to_i?.try &.clamp(0, MAX_ITEMS_PER_PAGE)
    max_results ||= user.preferences.max_results
    max_results ||= CONFIG.default_user_preferences.max_results

    page = env.params.query["page"]?.try &.to_i?
    page ||= 1

    params = HTTP::Params.parse(env.params.query["params"]? || "")

    videos, notifications = get_subscription_feed(user, max_results, page)

    XML.build(indent: "  ", encoding: "UTF-8") do |xml|
      xml.element("feed", "xmlns:yt": "http://www.youtube.com/xml/schemas/2015",
        "xmlns:media": "http://search.yahoo.com/mrss/", xmlns: "http://www.w3.org/2005/Atom",
        "xml:lang": "en-US") do
        xml.element("link", "type": "text/html", rel: "alternate", href: "#{HOST_URL}/feed/subscriptions")
        xml.element("link", "type": "application/atom+xml", rel: "self",
          href: "#{HOST_URL}#{env.request.resource}")
        xml.element("title") { xml.text I18n.translate(locale, "Invidious Private Feed for `x`", user.username) }
        xml.element("id") { xml.text "#{HOST_URL}/feed/private?#{URI::Params.encode({"token" => user.token})}" }
        xml.element("updated") { xml.text (notifications + videos).map(&.updated).max?.try(&.to_rfc3339) || Time.utc.to_rfc3339 }
        xml.element("author") { xml.element("name") { xml.text user.username } }

        (notifications + videos).each do |video|
          video.to_xml(locale, params, xml)
        end
      end
    end
  end

  def self.rss_playlist(env)
    locale = env.get("preferences").as(Preferences).locale

    env.response.headers["Content-Type"] = "application/atom+xml"
    env.response.content_type = "application/atom+xml"

    plid = env.params.url["plid"]

    params = HTTP::Params.parse(env.params.query["params"]? || "")
    path = env.request.path

    if plid.starts_with?("RD")
      begin
        seed = Invidious::NativePlaylists.seed(plid, env.params.query["continuation"]?)
        return Invidious::RSS.mix(fetch_mix(plid, seed, locale: locale), seed)
      rescue ex
        return error_atom(404, ex)
      end
    end
    if plid.starts_with?("IV")
      playlist = Invidious::Database::Playlists.select(id: plid)
      user = env.get?("user").try &.as(User)
      return error_atom(404, "Playlist does not exist.") unless playlist && (!playlist.privacy.private? || playlist.author == user.try(&.email))
      env.response.headers["Cache-Control"] = "private, no-store" if playlist.privacy.private?
      return Invidious::RSS.playlist(playlist)
    end

    response = YT_POOL.client &.get("/feeds/videos.xml?playlist_id=#{plid}")
    return error_atom(404, NotFoundException.new("Playlist does not exist.")) if response.status_code == 404

    document = XML.parse(response.body)
    document.xpath_nodes(%q(//*[@href]|//*[@url])).each do |node|
      node.attributes.each do |attribute|
        case attribute.name
        when "url", "href"
          request_target = URI.parse(node[attribute.name]).request_target
          query_string_opt = request_target.starts_with?("/watch?v=") ? ("&#{params}" if !params.empty?) : ""
          node[attribute.name] = "#{HOST_URL}#{request_target}#{query_string_opt}"
        else nil # Skip
        end
      end
    end

    document = document.to_xml(options: XML::SaveOptions::NO_DECL)

    document.scan(/<uri>(?<url>[^<]+)<\/uri>/).each do |match|
      content = "#{HOST_URL}#{URI.parse(match["url"]).request_target}"
      document = document.gsub(match[0], "<uri>#{content}</uri>")
    end
    document
  end

  def self.rss_videos(env)
    if ucid = env.params.query["channel_id"]?
      env.redirect "/feed/channel/#{ucid}"
    elsif user = env.params.query["user"]?
      env.redirect "/feed/channel/#{user}"
    elsif plid = env.params.query["playlist_id"]?
      env.redirect "/feed/playlist/#{plid}"
    end
  end
end

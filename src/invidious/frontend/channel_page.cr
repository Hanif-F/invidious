module Invidious::Frontend::ChannelPage
  extend self

  enum TabsAvailable
    Videos
    Shorts
    Streams
    Podcasts
    Releases
    Courses
    Shows
    Playlists
    Clips
    Posts
    Channels
    Search
  end

  private def available?(channel, tab, selected)
    return false if tab.playlists? && channel.auto_generated
    return selected.search? if tab.search?
    return true if tab.clips?
    return channel.tabs.includes?("posts") || channel.tabs.includes?("community") if tab.posts?
    channel.tabs.includes?(tab.to_s.downcase) || tab == selected
  end

  private def tab_link(str, locale, channel, tab, selected)
    label = I18n.translate(locale, "channel_tab_#{tab.to_s.downcase}_label")
    path = tab.videos? ? "/channel/#{channel.ucid}" : "/channel/#{channel.ucid}/#{tab.to_s.downcase}"
    if tab == selected
      str << %(<strong aria-current="page">) << label << "</strong>"
    else
      str << %(<a href=") << HTML.escape(path) << %(">) << label << "</a>"
    end
  end

  def generate_tabs_links(locale : String, channel : AboutChannel, selected_tab : TabsAvailable)
    String.build do |str|
      str << %(<div class="channel-core-tabs">)
      {TabsAvailable::Videos, TabsAvailable::Shorts, TabsAvailable::Streams, TabsAvailable::Playlists, TabsAvailable::Clips, TabsAvailable::Posts, TabsAvailable::Search}.each do |tab|
        tab_link(str, locale, channel, tab, selected_tab) if available?(channel, tab, selected_tab)
      end
      str << "</div>"
      overflow = {TabsAvailable::Podcasts, TabsAvailable::Releases, TabsAvailable::Courses, TabsAvailable::Shows, TabsAvailable::Channels}
      selected_more = overflow.includes?(selected_tab)
      str << %(<details class="ui-menu channel-more" data-ui-menu><summary class="button")
      str << %( aria-current="page") if selected_more
      str << ">" << I18n.translate(locale, "overhaul_more")
      str << " · " << I18n.translate(locale, "channel_tab_#{selected_tab.to_s.downcase}_label") if selected_more
      str << Icons.render("chevron-down") << %(</summary><div class="menu-content">)
      overflow.each do |tab|
        tab_link(str, locale, channel, tab, selected_tab) if available?(channel, tab, selected_tab)
      end
      str << %(<a href="#channel-about">) << Icons.render("info") << I18n.translate(locale, "overhaul_about") << "</a></div></details>"
    end
  end
end

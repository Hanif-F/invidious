# Documentation-only additions for a page absent from the baseline fixtures and
# ordinary navigation preferences. Uses the existing synthetic renderer context.
require "../../tests/frontend/render_fixtures"

def audit_hashtag_fixture(mode)
  env = fixture_env("/hashtag/light", mode)
  preferences = env.get("preferences").as(Preferences)
  locale = preferences.locale
  hashtag = "#light"
  navbar_search = true
  items = [SearchVideo.new({title: "An observed moment", id: "2isYuQZMbdU", author: "Studio North", ucid: "UCfixture", published: Time.utc - 3.days, views: 123456_i64, description_html: "A small observation.", length_seconds: 720, premiere_timestamp: nil, author_verified: true, author_thumbnail: nil, badges: VideoBadges::None})]
  page_nav_html = Invidious::Frontend::Pagination.nav_numeric(locale, base_url: "/hashtag/light", current_page: 1, show_next: true)
  render "src/invidious/views/hashtag.ecr", "src/invidious/views/template.ecr"
end

def audit_feed_menu_fixture
  env = signed_in_env("/preferences?section=browsing")
  preferences = env.get("preferences").as(Preferences)
  preferences.dark_mode = "light"
  preferences.feed_menu = ["Trending", "Popular"]
  env.set "preferences", preferences
  overhaul_settings_fixture(env)
end

audit_output = ENV["FRONTEND_FIXTURES"]? || "tests/frontend/.generated"
{"light", "dark"}.each do |mode|
  File.write("#{audit_output}/audit-hashtag-#{mode}.html", audit_hashtag_fixture(mode))
end
File.write("#{audit_output}/audit-feed-menu-reordered.html", audit_feed_menu_fixture)
puts "Audit additions: hashtag Light/Dark and reordered feed menu rendered with production templates"

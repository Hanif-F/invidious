module Invidious::Frontend::Comments
  extend self

  def template_reddit(root, locale, parent_permalink : String? = nil)
    String.build do |html|
      root.each do |thing|
        case child = thing.data
        when RedditComment
          author = HTML.escape(child.author)
          permalink = "https://www.reddit.com#{child.permalink}"
          html << %(<article class="comment comment-no-avatar comment-reddit"><div class="comment-main"><div class="comment-author"><a href="https://www.reddit.com/user/#{URI.encode_www_form(child.author)}" dir="auto">#{author}</a></div>)
          html << %(<div class="comment-body" dir="auto">#{HTML.unescape(child.body_html)}</div><footer class="comment-meta">)
          html << %(<span>#{I18n.translate_count(locale, "comments_points_count", child.score, I18n::NumberFormatting::Separator)}</span>)
          html << %(<time datetime="#{child.created_utc.to_rfc3339}" title="#{HTML.escape(child.created_utc.to_s("%a %B %-d %T %Y UTC"))}">#{I18n.translate(locale, "`x` ago", recode_date(child.created_utc, locale))}</time>)
          html << %(<a href="#{HTML.escape(permalink)}" rel="noopener noreferrer" aria-label="#{I18n.translate(locale, "permalink")}">#{Icons.render("external-link")}</a></footer>)
          if child.replies.is_a?(RedditThing)
            replies = child.replies.as(RedditThing).data.as(RedditListing).children
            unless replies.empty?
              html << %(<details class="comment-replies"><summary><span class="thread-closed">#{I18n.translate(locale, "Show replies")}</span><span class="thread-open">#{I18n.translate(locale, "Hide replies")}</span></summary><div>#{template_reddit(replies, locale, permalink)}</div></details>)
            end
          end
          html << "</div></article>"
        when RedditMore
          if parent_permalink && child.count > 0
            html << %(<p class="comment-more"><a href="#{HTML.escape(parent_permalink)}" rel="noopener noreferrer">#{I18n.translate(locale, "View more comments on Reddit")}</a></p>)
          end
        end
      end
    end
  end
end

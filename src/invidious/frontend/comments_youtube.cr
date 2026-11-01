module Invidious::Frontend::Comments
  extend self

  private def image_proxy(value : String?) : String?
    return if value.nil? || value.empty?
    "/ggpht#{URI.parse(value).request_target}"
  rescue URI::Error
    nil
  end

  # Shared by full pages and the existing API's contentHtml responses. All
  # continuations stay strings and each reply control belongs to one thread.
  def template_youtube(comments, locale, thin_mode, is_replies = false, sort_by = "top")
    fallback = if post = comments["postId"]?.try(&.as_s?)
                 "/post/#{URI.encode_www_form(post)}?nojs=1"
               elsif channel = comments["authorId"]?.try(&.as_s?)
                 "/channel/#{URI.encode_www_form(channel)}/community?"
               elsif video = comments["videoId"]?.try(&.as_s?)
                 "/watch?v=#{URI.encode_www_form(video)}&nojs=1&comments_source=youtube&comments_sort=#{URI.encode_www_form(sort_by)}"
               end
    cursor_key = comments["videoId"]? ? "comments_continuation" : "continuation"
    String.build do |html|
      comments["comments"].as_a.each do |child|
        comment_id = child["commentId"].as_s
        escaped_id = HTML.escape(comment_id)
        author_name = HTML.escape(child["author"].as_s)
        owner = child["authorIsChannelOwner"]?.try(&.as_bool?) || false
        avatar_source = unless thin_mode
          child["authorThumbnail"]?.try(&.as_s?) || child["authorThumbnails"]?.try(&.as_a?.try(&.last?.try(&.["url"]?.try(&.as_s?))))
        end
        html << %(<article class="comment#{thin_mode ? " comment-no-avatar" : ""}" data-comment-id="#{escaped_id}">)
        unless thin_mode
          html << %(<span class="comment-avatar">) << ChannelAvatars.render_image(child["author"].as_s, avatar_source, 40) << "</span>"
        end
        html << %(<div class="comment-main"><div class="comment-author"><a class="#{owner ? "channel-owner" : ""}" href="#{HTML.escape(child["authorUrl"].as_s)}" dir="auto">#{author_name}</a>)
        html << %(<span class="verified" title="#{I18n.translate(locale, "Verified")}">#{Icons.render("check")}</span>) if child["verified"]?.try(&.as_bool?)
        if child["isSponsor"]?.try(&.as_bool?)
          if sponsor = image_proxy(child["sponsorIconUrl"]?.try(&.as_s?))
            html << %(<img src="#{HTML.escape(sponsor)}" alt="#{I18n.translate(locale, "Channel Sponsor")}" width="16" height="16" loading="lazy">)
          end
        end
        html << %(<span class="comment-pinned">#{I18n.translate(locale, "overhaul_comment_pinned")}</span>) if child["isPinned"]?.try(&.as_bool?)
        html << %(</div><div class="comment-body" dir="auto">#{child["contentHtml"]}</div>)

        if attachment = child["attachment"]?
          case attachment["type"]?.try(&.as_s?)
          when "image"
            images = attachment["imageThumbnails"].as_a
            if raw = (images[1]? || images.last?).try(&.["url"].as_s)
              if url = image_proxy(raw)
                html << %(<figure class="comment-image"><img src="#{HTML.escape(url)}" alt="" loading="lazy" decoding="async"></figure>)
              end
            end
          when "video"
            if error = attachment["error"]?
              html << %(<p class="comment-attachment-error">#{HTML.escape(error.as_s)}</p>)
            elsif id = attachment["videoId"]?.try(&.as_s?)
              if id.matches?(/\A[A-Za-z0-9_-]{11}\z/)
                html << %(<div class="comment-video"><iframe src="/embed/#{id}?autoplay=0" title="#{I18n.translate(locale, "Video")}" loading="lazy" allowfullscreen></iframe></div>)
              end
            end
          when "multiImage"
            images = attachment["images"].as_a
            html << %(<section class="carousel" aria-label="#{I18n.translate(locale, "overhaul_post_images")}"><a class="skip-link" href="#skip-#{escaped_id}">#{I18n.translate(locale, "carousel_skip")}</a><div class="slides">)
            images.each_with_index do |sizes, i|
              if raw = (sizes.as_a[1]? || sizes.as_a.last?).try(&.["url"].as_s)
                if url = image_proxy(raw)
                  label = I18n.translate(locale, "carousel_slide", {"current" => (i + 1).to_s, "total" => images.size.to_s})
                  html << %(<figure class="slides-item" id="#{escaped_id}-slide-#{i + 1}" tabindex="-1" aria-label="#{HTML.escape(label)}"><img src="#{HTML.escape(url)}" alt="" loading="lazy" decoding="async"></figure>)
                end
              end
            end
            html << %(</div><nav class="carousel__nav" aria-label="#{I18n.translate(locale, "overhaul_post_images")}">)
            images.each_index do |i|
              html << %(<a class="button" href="##{escaped_id}-slide-#{i + 1}" aria-label="#{HTML.escape(I18n.translate(locale, "carousel_go_to", (i + 1).to_s))}">#{i + 1}</a>)
            end
            html << %(</nav><span id="skip-#{escaped_id}" tabindex="-1"></span></section>)
          end
        end

        published = Time.unix(child["published"].as_i64)
        date_label = published.to_s(I18n.translate(locale, "%A %B %-d, %Y"))
        html << %(<footer class="comment-meta"><time datetime="#{published.to_rfc3339}" title="#{HTML.escape(date_label)}">#{I18n.translate(locale, "`x` ago", recode_date(published, locale))}</time>)
        html << %(<span>#{I18n.translate(locale, "(edited)")}</span>) if child["isEdited"]?.try(&.as_bool?)
        permalink = nil
        if id = comments["videoId"]?.try(&.as_s?)
          permalink = "https://www.youtube.com/watch?v=#{URI.encode_www_form(id)}&lc=#{URI.encode_www_form(comment_id)}"
        elsif id = comments["authorId"]?.try(&.as_s?)
          permalink = "https://www.youtube.com/channel/#{URI.encode_www_form(id)}/community?lb=#{URI.encode_www_form(comment_id)}"
        end
        if permalink
          html << %(<a href="#{HTML.escape(permalink)}" rel="noreferrer noopener" aria-label="#{I18n.translate(locale, "YouTube comment permalink")}" title="#{I18n.translate(locale, "YouTube comment permalink")}">#{Icons.render("external-link")}</a>)
        end
        if likes = child["likeCount"]?
          html << %(<span class="comment-likes" aria-label="#{I18n.translate(locale, "overhaul_likes")}">#{Icons.render("thumbs-up")} #{number_with_separator(likes)}</span>)
        end
        if heart = child["creatorHeart"]?
          label = HTML.escape(I18n.translate(locale, "`x` marked it with a ❤", heart["creatorName"].as_s))
          html << %(<span class="creator-heart-container" title="#{label}" aria-label="#{label}">)
          if !thin_mode && (creator = image_proxy(heart["creatorThumbnail"]?.try(&.as_s?)))
            html << %(<img src="#{HTML.escape(creator)}" alt="" width="20" height="20" loading="lazy">)
          end
          html << Icons.render("heart") << "</span>"
        end
        html << "</footer>"
        if replies = child["replies"]?
          label = I18n.translate_count(locale, "comments_view_x_replies", replies["replyCount"].as_i64, I18n::NumberFormatting::Separator)
          token = replies["continuation"].as_s
          control = fallback ? %(<a href="#{HTML.escape(fallback + (fallback.ends_with?('?') ? "" : "&") + "#{cursor_key}=" + URI.encode_www_form(token))}" class="text-button") : %(<button type="button" class="text-button")
          html << %(<div class="comment-replies" data-comment-replies><div><p>#{control} data-continuation="#{HTML.escape(token)}" data-onclick="get_youtube_replies" data-load-replies>#{label}</#{fallback ? "a" : "button"}></p></div></div>)
        elsif comments["authorId"]? && !comments["singlePost"]?
          label = I18n.translate_count(locale, "comments_view_x_replies", child["replyCount"].as_i64, I18n::NumberFormatting::Separator)
          html << %(<p class="comment-reply-link"><a href="/post/#{URI.encode_www_form(comment_id)}?ucid=#{URI.encode_www_form(comments["authorId"].as_s)}">#{label}</a></p>)
        end
        html << "</div></article>"
      end
      if continuation = comments["continuation"]?.try(&.as_s?)
        control = fallback ? %(<a href="#{HTML.escape(fallback + (fallback.ends_with?('?') ? "" : "&") + "#{cursor_key}=" + URI.encode_www_form(continuation))}" class="button") : %(<button type="button" class="button")
        html << %(<div class="comment-more" data-comment-more><div><p>#{control} data-continuation="#{HTML.escape(continuation)}" data-onclick="get_youtube_replies" data-load-more #{"data-load-replies" if is_replies}>#{I18n.translate(locale, "Load more")}</#{fallback ? "a" : "button"}></p></div></div>)
      end
    end
  end
end

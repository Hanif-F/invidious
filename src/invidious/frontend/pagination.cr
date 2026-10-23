require "uri"

module Invidious::Frontend::Pagination
  extend self

  private def link_start(str : String::Builder, url : String, post : Bool)
    unless post
      str << %(<a href=") << HTML.escape(url) << %(" class="pure-button pure-button-secondary">)
      return
    end
    uri = URI.parse(url)
    str << %(<form method="post" action=") << HTML.escape(uri.path) << %(">)
    uri.query_params.each do |key, value|
      str << %(<input type="hidden" name=") << HTML.escape(key) << %(" value=") << HTML.escape(value) << %(">)
    end
    str << %(<button type="submit" class="pure-button pure-button-secondary">)
  end

  private def first_page(str : String::Builder, locale : String?, url : String)
    str << %(<a href=") << url << %(" class="pure-button pure-button-secondary">)

    if I18n.locale_is_rtl?(locale)
      # Inverted arrow ("first" points to the right)
      str << I18n.translate(locale, "First page")
      str << "&nbsp;&nbsp;"
      str << %(<i class="icon ion-ios-arrow-forward"></i>)
    else
      # Regular arrow ("first" points to the left)
      str << %(<i class="icon ion-ios-arrow-back"></i>)
      str << "&nbsp;&nbsp;"
      str << I18n.translate(locale, "First page")
    end

    str << "</a>"
  end

  private def previous_page(str : String::Builder, locale : String?, url : String, post : Bool = false)
    # Link
    link_start(str, url, post)

    if I18n.locale_is_rtl?(locale)
      # Inverted arrow ("previous" points to the right)
      str << I18n.translate(locale, "Previous page")
      str << "&nbsp;&nbsp;"
      str << %(<i class="icon ion-ios-arrow-forward"></i>)
    else
      # Regular arrow ("previous" points to the left)
      str << %(<i class="icon ion-ios-arrow-back"></i>)
      str << "&nbsp;&nbsp;"
      str << I18n.translate(locale, "Previous page")
    end

    str << (post ? "</button></form>" : "</a>")
  end

  private def next_page(str : String::Builder, locale : String?, url : String, post : Bool = false)
    # Link
    link_start(str, url, post)

    if I18n.locale_is_rtl?(locale)
      # Inverted arrow ("next" points to the left)
      str << %(<i class="icon ion-ios-arrow-back"></i>)
      str << "&nbsp;&nbsp;"
      str << I18n.translate(locale, "Next page")
    else
      # Regular arrow ("next" points to the right)
      str << I18n.translate(locale, "Next page")
      str << "&nbsp;&nbsp;"
      str << %(<i class="icon ion-ios-arrow-forward"></i>)
    end

    str << (post ? "</button></form>" : "</a>")
  end

  def nav_numeric(locale : String?, *, base_url : String | URI, current_page : Int, show_next : Bool = true, post : Bool = false)
    # Pagination replaces the page parameter rather than appending a second
    # value. This matters for both browser URLSearchParams and POST forms.
    clean_url = URI.parse(base_url.to_s)
    clean_params = clean_url.query_params
    clean_params.delete_all("page")
    clean_url.query = clean_params.to_s
    return String.build do |str|
      str << %(<div class="h-box">\n)
      str << %(<div class="page-nav-container flexible">\n)

      str << %(<div class="page-prev-container flex-left">)

      if current_page > 1
        params_prev = URI::Params{"page" => (current_page - 1).to_s}
        url_prev = HttpServer::Utils.add_params_to_url(clean_url.to_s, params_prev)

        self.previous_page(str, locale, url_prev.to_s, post)
      end

      str << %(</div>\n)
      str << %(<div class="page-next-container flex-right">)

      if show_next
        params_next = URI::Params{"page" => (current_page + 1).to_s}
        url_next = HttpServer::Utils.add_params_to_url(clean_url.to_s, params_next)

        self.next_page(str, locale, url_next.to_s, post)
      end

      str << %(</div>\n)

      str << %(</div>\n)
      str << %(</div>\n\n)
    end
  end

  def nav_ctoken(locale : String?, *, base_url : String | URI, ctoken : String?, first_page : Bool, params : URI::Params)
    return String.build do |str|
      str << %(<div class="h-box">\n)
      str << %(<div class="page-nav-container flexible">\n)

      str << %(<div class="page-prev-container flex-left">)

      if !first_page
        self.first_page(str, locale, base_url.to_s)
      end

      str << %(</div>\n)

      str << %(<div class="page-next-container flex-right">)

      if !ctoken.nil?
        params["continuation"] = ctoken
        url_next = HttpServer::Utils.add_params_to_url(base_url, params)

        self.next_page(str, locale, url_next.to_s)
      end

      str << %(</div>\n)

      str << %(</div>\n)
      str << %(</div>\n\n)
    end
  end
end

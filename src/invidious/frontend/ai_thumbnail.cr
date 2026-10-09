require "html"
require "../helpers/i18n"

# Rendering stays independent of list storage and channel metadata lookups.
module Invidious::Frontend::AiThumbnail
  extend self

  def render(kind : String, locale : String?, compact = false) : String
    message = HTML.escape(I18n.translate(locale, "ai_thumbnail_#{kind}_message"))
    label = HTML.escape(I18n.translate(locale, "ai_thumbnail_#{kind}_label"))
    %(<span class="ai-thumbnail#{compact ? " ai-thumbnail-compact" : ""}" role="img" aria-label="#{message} · #{label}"><span class="ai-thumbnail-message" dir="auto" aria-hidden="true">#{message}</span><span class="ai-thumbnail-list" dir="auto" aria-hidden="true">#{label}</span></span>)
  end
end

# Trusted, pinned local SVG symbols. Upstream/license/digests: assets/icons/.
# This renderer never interpolates arbitrary upstream markup or symbol names.
module Invidious::Frontend::Icons
  NAMES = %w(menu search settings user log-out sun moon monitor house trending-up bell history list-video scissors plus check x ellipsis-vertical bookmark share-2 download headphones external-link rss grip-vertical eye eye-off shield captions languages gauge chevron-right chevron-down play pause volume-2 picture-in-picture-2 maximize layout-panel-top info rotate-cw keyboard trash-2 arrow-left filter heart thumbs-up lock globe volume-x)

  def self.render(name : String) : String
    raise ArgumentError.new("Unknown interface icon") unless NAMES.includes?(name)
    %(<svg class="ui-icon" aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="/icons/lucide.svg?v=#{ASSET_COMMIT}##{name}"></use></svg>)
  end
end

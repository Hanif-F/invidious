require "html"

module Invidious::Frontend::WatchedIndicator
  extend self

  # Every individual-video thumbnail uses the same metadata contract. The shared
  # browser script supplies the saved position from the existing account/local store.
  def render(id : String, length_seconds : Int?, watched : Bool = false) : String
    %(<span class="watched-indicator" hidden data-id="#{HTML.escape(id)}" data-length="#{length_seconds || 0}" data-watched="#{watched}"></span>)
  end
end

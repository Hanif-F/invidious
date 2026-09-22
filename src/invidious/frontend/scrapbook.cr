require "digest/sha256"

# Stable presentation metadata, shared by initial and asynchronously rendered cards.
# Each dimension uses a different digest byte; no process-random String#hash or JS.
module Invidious::Frontend::Scrapbook
  extend self

  def attributes(identity : String, occurrence : Int) : String
    bytes = Digest::SHA256.digest("#{identity.bytesize}:#{identity}:#{occurrence}")
    dimensions = {"paper" => 12, "tape" => 5, "attach" => 6, "edge" => 4,
                  "angle" => 9, "offset" => 7, "space" => 4, "doodle" => 12,
                  "ink" => 5, "mark" => 4}
    String.build do |html|
      dimensions.each_with_index do |(name, count), index|
        html << %( data-scrap-#{name}="#{bytes[index].to_i % count}")
      end
    end
  end

  def item_attributes(item, occurrence : Int) : String
    identity = if item.responds_to?(:id)
                 item.id.to_s
               elsif item.responds_to?(:ucid)
                 item.ucid.to_s
               elsif item.responds_to?(:url)
                 item.url.to_s
               elsif item.responds_to?(:title)
                 item.title.to_s
               else
                 item.class.to_s
               end
    attributes("#{item.class}:#{identity}", occurrence)
  end
end

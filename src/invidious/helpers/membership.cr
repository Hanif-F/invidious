require "json"

# Inspect video badge/metadata containers only. A channel's Join button, video
# title or description is not evidence that the video requires membership.
module Invidious::Videos::Membership
  extend self

  def detected?(renderer : JSON::Any) : Bool
    {"badges", "topStandaloneBadge", "thumbnailOverlays", "contentImage", "metadata", "overlays"}.any? do |key|
      renderer.as_h?.try(&.[key]?).try { |value| marker?(value, key == "metadata") } || false
    end
  end

  # Badge order is not fixed: the membership badge may precede the duration.
  def thumbnail_duration(thumbnail : JSON::Any?) : String?
    overlays = thumbnail.try &.dig?("overlays").try &.as_a?
    overlays.try &.each do |overlay|
      badges = overlay.dig?("thumbnailBottomOverlayViewModel", "badges").try &.as_a?
      badges.try &.each do |badge|
        text = badge.dig?("thumbnailBadgeViewModel", "text").try &.as_s?
        return text if text && text.matches?(/\A\d+(?::\d{2}){1,2}\z/)
      end
    end
    nil
  end

  private def marker?(value : JSON::Any, metadata = false) : Bool
    if object = value.as_h?
      # Linked metadata is an author or another navigation label, not a badge.
      return false if metadata && object["commandRuns"]?
      style = object["style"]?.try &.as_s?
      return true if {"BADGE_STYLE_TYPE_MEMBERS_ONLY", "BADGE_STYLE_TYPE_MEMBER_ONLY"}.includes?(style)
      {"label", "text", "accessibilityText"}.each do |key|
        return true if member_label?(object[key]?.try &.as_s?)
      end
      # Modern lockups use metadata rows instead of metadataBadgeRenderer.
      return true if metadata && member_label?(object["content"]?.try &.as_s?)
      object.any? do |key, child|
        next false if {"title", "description", "commandRuns", "onTap", "navigationEndpoint", "accessibility"}.includes?(key)
        marker?(child, metadata)
      end
    elsif array = value.as_a?
      array.any? { |child| marker?(child, metadata) }
    else
      false
    end
  end

  private def member_label?(label : String?) : Bool
    {"members only", "members-only", "member exclusive", "members-only video"}.includes?(label.try &.strip.downcase)
  end
end

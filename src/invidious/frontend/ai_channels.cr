require "../ai_slist_runtime"
require "./ai_thumbnail"

add_context_storage_type(Hash(String, String))

module Invidious::Frontend::AiChannels
  extend self

  def enabled(preferences : Preferences, surface : Symbol) : Tuple(Bool, Bool)
    case surface
    when :feeds           then {preferences.ai_blocklist_feeds, preferences.ai_warnlist_feeds}
    when :search          then {preferences.ai_blocklist_search, preferences.ai_warnlist_search}
    when :recommendations then {preferences.ai_blocklist_recommendations, preferences.ai_warnlist_recommendations}
    when :other           then {preferences.ai_blocklist_other_pages, preferences.ai_warnlist_other_pages}
    else                       {false, false}
    end
  end

  def observe(items)
    AiSList.observe_items(items)
  end

  def filter(items, env, surface : Symbol)
    observe(items)
    ids = [] of String
    items.each do |item|
      ids << item.ucid if item.is_a?(SearchVideo | ChannelVideo)
    end
    blocked, thumbnails = decisions(env.get("preferences").as(Preferences), surface, ids)
    env.set "ai_thumbnail_matches", thumbnails
    result = items.reject do |item|
      (item.is_a?(SearchVideo) || item.is_a?(ChannelVideo)) && blocked.includes?(item.ucid)
    end
    env.set "ai_filtered_results", result.size < items.size
    result
  end

  def recommendations(items, env)
    supplied = {} of String => String
    items.each do |item|
      if handle = item["author_handle"]?
        supplied[item["ucid"]? || ""] = handle
      end
    end
    AiSList.runtime.resolver.observe(supplied) unless supplied.empty?
    blocked, thumbnails = decisions(env.get("preferences").as(Preferences), :recommendations, items.map { |item| item["ucid"]? || "" })
    env.set "ai_thumbnail_matches", thumbnails
    result = items.reject { |item| blocked.includes?(item["ucid"]? || "") }
    env.set "ai_filtered_recommendations", result.size < items.size
    result
  end

  # Discovery helpers prepare this map even when disabled, so a shared template
  # must not apply the other-page preferences to discovery results afterwards.
  def prepare(env, items)
    return if env.get?("ai_thumbnail_matches")
    observe(items)
    ids = [] of String
    items.each do |item|
      ids << item.ucid if item.is_a?(SearchVideo | ChannelVideo | PlaylistVideo | MixVideo)
    end
    prepare_ids(env, ids)
  end

  def prepare_ids(env, ids : Array(String)) : Hash(String, String)
    _, thumbnails = decisions(env.get("preferences").as(Preferences), :other, ids)
    env.set "ai_thumbnail_matches", thumbnails
    thumbnails
  end

  def prepare_queue(env, videos : Array(JSON::Any)) : Hash(String, String)
    prepare_ids(env, videos.compact_map { |video| video["authorId"]?.try &.as_s? })
  end

  def thumbnail_kind(env, id : String) : String?
    env.get?("ai_thumbnail_matches").try &.as(Hash(String, String))[id]?
  end

  def render_thumbnail(kind : String, locale : String?, compact = false) : String
    AiThumbnail.render(kind, locale, compact)
  end

  # One collection-wide lookup shares the resolver's existing deadline. Only
  # resolve a handle when another match could change visibility or warning text.
  private def decisions(preferences : Preferences, surface : Symbol, ids : Array(String)) : Tuple(Set(String), Hash(String, String))
    blocked = Set(String).new
    thumbnails = {} of String => String
    block, warn = enabled(preferences, surface)
    return {blocked, thumbnails} unless block || warn
    lists = AiSList.runtime.lists
    active = {} of String => AiSList::Entries
    lists.snapshot("blocklist").try { |snapshot| active["blocklist"] = snapshot.entries } if block
    lists.snapshot("warnlist").try { |snapshot| active["warnlist"] = snapshot.entries } if warn
    return {blocked, thumbnails} if active.empty?
    actions = {
      "blocklist" => surface == :other ? "replace_thumbnail" : Preferences::AiListAction.normalize(preferences.ai_blocklist_action),
      "warnlist"  => surface == :other ? "replace_thumbnail" : Preferences::AiListAction.normalize(preferences.ai_warnlist_action),
    }
    ids = ids.uniq.select { |id| AiSList.valid_id?(id) }
    matches = ids.to_h { |id| {id, active.select { |_, list| list.ids.includes?(id) }.keys} }
    missing = ids.select do |id|
      current_priority = matches[id].max_of? { |kind| priority(kind, actions[kind]) } || 0
      active.any? { |kind, list| !list.handles.empty? && priority(kind, actions[kind]) > current_priority }
    end
    unless missing.empty?
      AiSList.runtime.resolver.handles(missing).each do |id, handle|
        active.each do |kind, list|
          matches[id] << kind if list.handles.includes?(handle) && !matches[id].includes?(kind)
        end
      end
    end
    matches.each do |id, kinds|
      if kinds.any? { |kind| actions[kind] == "hide" }
        blocked << id
      elsif kind = AiSList::KINDS.find { |kind| kinds.includes?(kind) }
        thumbnails[id] = kind
      end
    end
    {blocked, thumbnails}
  end

  private def priority(kind : String, action : String) : Int32
    action == "hide" ? 3 : (kind == "blocklist" ? 2 : 1)
  end
end

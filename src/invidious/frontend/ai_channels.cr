require "../ai_slist_runtime"

module Invidious::Frontend::AiChannels
  extend self

  def enabled(preferences : Preferences, surface : Symbol) : Tuple(Bool, Bool)
    case surface
    when :feeds           then {preferences.ai_blocklist_feeds, preferences.ai_warnlist_feeds}
    when :search          then {preferences.ai_blocklist_search, preferences.ai_warnlist_search}
    when :recommendations then {preferences.ai_blocklist_recommendations, preferences.ai_warnlist_recommendations}
    else                       {false, false}
    end
  end

  def observe(items)
    AiSList.observe_items(items)
  end

  def filter(items, env, surface : Symbol)
    observe(items)
    ids = items.compact_map do |item|
      item.ucid if item.is_a?(SearchVideo) || item.is_a?(ChannelVideo)
    end
    blocked = blocked_ids(env, surface, ids)
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
    blocked = blocked_ids(env, :recommendations, items.map { |item| item["ucid"]? || "" })
    result = items.reject { |item| blocked.includes?(item["ucid"]? || "") }
    env.set "ai_filtered_recommendations", result.size < items.size
    result
  end

  private def blocked_ids(env, surface : Symbol, ids : Array(String)) : Set(String)
    block, warn = enabled(env.get("preferences").as(Preferences), surface)
    return Set(String).new unless block || warn
    lists = AiSList.runtime.lists
    active = [] of AiSList::Entries
    lists.snapshot("blocklist").try { |snapshot| active << snapshot.entries } if block
    lists.snapshot("warnlist").try { |snapshot| active << snapshot.entries } if warn
    return Set(String).new if active.empty?

    # IDs listed directly need no metadata request. Likewise, an ID-only list
    # needs no handle resolution at all.
    blocked = ids.select { |id| active.any?(&.ids.includes?(id)) }.to_set
    if active.any? { |list| !list.handles.empty? }
      handles = AiSList.runtime.resolver.handles(ids.reject { |id| blocked.includes?(id) })
      handles.each do |id, handle|
        blocked << id if active.any?(&.handles.includes?(handle))
      end
    end
    blocked
  end
end

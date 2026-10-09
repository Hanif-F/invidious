require "./ai_slist"

module Invidious::AiSList::Api
  extend self

  def parameters(ids : String?, kinds : String?) : Tuple(Array(String), Array(String))
    channels = (ids || "").split(',')
    selected = (kinds || "").split(',')
    raise ArgumentError.new("Expected 1–100 canonical channel IDs and blocklist/warnlist kinds") unless (1..100).includes?(channels.size) && channels.all? { |id| AiSList.valid_id?(id) } &&
                                                                                                        (1..2).includes?(selected.size) && selected.all? { |kind| AiSList::KINDS.includes?(kind) }
    {channels.uniq, selected.uniq}
  end

  def status(lists : AiSList::Lists)
    AiSList::KINDS.to_h do |kind|
      snapshot = lists.snapshot(kind)
      {kind, {available: !snapshot.nil?, stale: lists.stale?(kind), channelCount: snapshot.try(&.entries.size) || 0,
              updatedAt: snapshot.try(&.updated_at.to_rfc3339)}}
    end
  end

  def classify(ids : Array(String), kinds : Array(String), lists : AiSList::Lists, resolver : AiSList::Resolver)
    snapshots = kinds.to_h { |kind| {kind, lists.snapshot(kind)} }
    missing = ids.select do |id|
      snapshots.values.any? { |snapshot| snapshot && !snapshot.entries.ids.includes?(id) && !snapshot.entries.handles.empty? }
    end
    handles = missing.empty? ? {} of String => String : resolver.handles(missing)
    channels = ids.to_h do |id|
      matched = kinds.select { |kind| snapshots[kind].try { |snapshot| snapshot.entries.includes?(id, handles[id]?) } }
      resolved = snapshots.values.all? do |snapshot|
        snapshot && (snapshot.entries.ids.includes?(id) || snapshot.entries.handles.empty? || handles.has_key?(id))
      end
      {id, {matches: matched, resolved: !!resolved}}
    end
    # Report the snapshots used for these results, even if a refresh ran while resolving.
    metadata = status(lists)
    snapshots.each do |kind, snapshot|
      metadata[kind] = {available: !snapshot.nil?, stale: lists.stale?(kind), channelCount: snapshot.try(&.entries.size) || 0,
                        updatedAt: snapshot.try(&.updated_at.to_rfc3339)}
    end
    {channels: channels, lists: metadata}
  end
end

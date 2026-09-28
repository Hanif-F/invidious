module Invidious::Videos::LiveChat
  extend self

  # The renderer continuation starts the replay API. Menu continuations only
  # become valid after that first request.
  def initial_continuation(data : Hash(String, JSON::Any)) : String?
    renderer = data.dig?("contents", "twoColumnWatchNextResults", "conversationBar", "liveChatRenderer")
    return nil unless renderer

    renderer.dig?("continuations", 0, "reloadContinuationData", "continuation").try(&.as_s?)
  end

  def unfiltered_continuation(data : Hash(String, JSON::Any)) : String?
    renderer = data.dig?("continuationContents", "liveChatContinuation")
    return nil unless renderer

    options = renderer.dig?("header", "liveChatHeaderRenderer", "viewSelector",
      "sortFilterSubMenuRenderer", "subMenuItems").try(&.as_a?)
    if options
      option = options.find { |item| item["title"]?.try(&.as_s?) == "Live chat" }
      option ||= options[1]? if options.size > 1
      token = option.try(&.dig?("continuation", "reloadContinuationData", "continuation")).try(&.as_s?)
      return token unless token.nil? || token.empty?
    end

    nil
  end

  def parse_chunk(data : Hash(String, JSON::Any))
    body = data.dig?("continuationContents", "liveChatContinuation")
    raise BrokenTubeException.new("liveChatContinuation") unless body

    messages = [] of Hash(String, JSON::Any)
    removed_ids = [] of String
    if actions = body["actions"]?.try(&.as_a?)
      actions.each do |entry|
        replay = entry["replayChatItemAction"]?
        next unless replay
        offset = replay["videoOffsetTimeMsec"]?.try(&.as_s?).try(&.to_i64?)
        next unless offset && offset >= 0
        next unless replay_actions = replay["actions"]?.try(&.as_a?)

        replay_actions.each do |action|
          if removed = action.dig?("removeChatItemAction", "targetItemId").try(&.as_s?)
            removed_ids << removed
            next
          end

          item = action.dig?("addChatItemAction", "item") ||
                 action.dig?("replaceChatItemAction", "replacementItem")
          next unless item

          type, renderer = renderer_for(item)
          next unless renderer
          id = renderer["id"]?.try(&.as_s?)
          next if id.nil? || id.empty?

          author = text_of(renderer["authorName"]?)
          author_channel_id = renderer["authorExternalChannelId"]?.try(&.as_s?) ||
                              renderer.dig?("authorName", "runs", 0, "navigationEndpoint", "browseEndpoint", "browseId").try(&.as_s?) || ""
          handle_path = renderer.dig?("authorName", "runs", 0, "navigationEndpoint", "browseEndpoint", "canonicalBaseUrl").try(&.as_s?) || ""
          author_handle = renderer["authorHandle"]?.try(&.as_s?) ||
                          (handle_path.starts_with?("/@") ? handle_path.lchop("/") : nil) ||
                          (author.starts_with?("@") && !author.includes?(' ') ? author : "")
          message = text_of(renderer["message"]?)
          message = text_of(renderer["headerSubtext"]?) if message.empty?
          message = text_of(renderer["sticker"]?.try(&.dig?("accessibility", "accessibilityData", "label"))) if message.empty?
          amount = text_of(renderer["purchaseAmountText"]?)
          message = amount if message.empty? && !amount.empty?
          next if message.empty?

          messages << {
            "id"              => JSON::Any.new(id),
            "offsetMs"        => JSON::Any.new(offset),
            "author"          => JSON::Any.new(author),
            "authorChannelId" => JSON::Any.new(author_channel_id),
            "authorHandle"    => JSON::Any.new(author_handle),
            "text"            => JSON::Any.new(message),
            "kind"            => JSON::Any.new(type),
            "amount"          => JSON::Any.new(amount),
          }
        end
      end
    end

    continuation = nil.as(String?)
    if items = body["continuations"]?.try(&.as_a?)
      items.each do |item|
        token = item.dig?("liveChatReplayContinuationData", "continuation") ||
                item.dig?("timedContinuationData", "continuation")
        if token
          continuation = token.as_s?
          break
        end
      end
    end

    {messages: messages, removed_ids: removed_ids, continuation: continuation}
  end

  private def renderer_for(item : JSON::Any) : {String, JSON::Any?}
    {
      {"liveChatTextMessageRenderer", "text"},
      {"liveChatPaidMessageRenderer", "paid"},
      {"liveChatMembershipItemRenderer", "membership"},
      {"liveChatPaidStickerRenderer", "paid_sticker"},
    }.each do |key, kind|
      return {kind, item[key]} if item[key]?
    end
    {"", nil}
  end

  private def text_of(value : JSON::Any?) : String
    return "" unless value
    return value.as_s.not_nil! if value.as_s?
    return "" unless value.as_h?
    return value["simpleText"]?.try(&.as_s?) || "" if value["simpleText"]?

    runs = value["runs"]?.try(&.as_a?)
    return "" unless runs
    runs.map do |run|
      run["text"]?.try(&.as_s?) ||
        run.dig?("emoji", "shortcuts", 0).try(&.as_s?) || ""
    end.join
  end
end

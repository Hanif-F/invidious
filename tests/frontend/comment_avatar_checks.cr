require "digest/sha256"

# Spy on the real cache boundary; the SQLite implementation still executes.
module Invidious::Database::ChannelAvatars
  class_getter comment_avatar_reads = 0
  class_getter comment_avatar_writes = 0

  def select(ids : Array(String)) : Hash(String, String)
    @@comment_avatar_reads += 1
    previous_def
  end

  def observe(avatars : Hash(String, String), observed_at : Time = Time.utc) : Bool
    @@comment_avatar_writes += 1
    previous_def
  end
end

def comment_avatar_fixture(name)
  JSON.parse(File.read("spec/invidious/comments/fixtures/#{name}.json"))
end

def expected_comment_avatars(kind)
  comment_avatar_fixture("expected_avatars")[kind].as_h.transform_values(&.as_s)
end

# Relative publication dates naturally change the timestamp between runs.
# Retain every other field and all markup except its calendar-date title.
def comment_avatar_output_digest(response)
  data = JSON.parse(response)
  data.as_h["comments"]?.try(&.as_a).try &.each do |record|
    record.as_h["published"] = JSON::Any.new(0_i64) if record["published"]?
  end
  if html = data["contentHtml"]?.try(&.as_s?)
    data.as_h["contentHtml"] = JSON::Any.new(html.gsub(/(<span title=")[A-Za-z]+ [A-Za-z]+ \d{1,2}, \d{4}(">)/, "\\1RELATIVE_DATE\\2"))
  end
  Digest::SHA256.hexdigest(data.to_json)
end

def check_comment_avatar_response(responses, label, expected, &)
  cache = Invidious::Database::ChannelAvatars
  PG_DB.exec("DELETE FROM channel_avatars")
  reads = cache.comment_avatar_reads
  writes = cache.comment_avatar_writes
  response = yield
  raise "#{label}: learning read the cache" unless cache.comment_avatar_reads == reads
  raise "#{label}: expected one batch write" unless cache.comment_avatar_writes == writes + (expected.empty? ? 0 : 1)
  stored = PG_DB.query_all("SELECT ucid, url FROM channel_avatars", as: {String, String}).to_h
  raise "#{label}: wrong channel/avatar association" unless stored == expected
  responses[label] = response
end

def comment_avatar_response_cases
  responses = {} of String => String
  {"json", "html"}.each do |format|
    {false, true}.each do |thin|
      suffix = "#{format}-#{thin}"
      check_comment_avatar_response(responses, "modern-#{suffix}", expected_comment_avatars("modern")) do
        Invidious::Comments.parse_youtube("2isYuQZMbdU", comment_avatar_fixture("modern_comments").as_h, format, "en-US", thin)
      end
      check_comment_avatar_response(responses, "legacy-#{suffix}", expected_comment_avatars("legacy")) do
        Invidious::Comments.parse_youtube("2isYuQZMbdU", comment_avatar_fixture("legacy_replies").as_h, format, "en-US", thin)
      end
      check_comment_avatar_response(responses, "post-comments-#{suffix}", expected_comment_avatars("modern")) do
        Invidious::Comments.parse_youtube("post-fixture", comment_avatar_fixture("modern_comments").as_h, format, "en-US", thin, is_post: true)
      end
      {false, true}.each do |single|
        check_comment_avatar_response(responses, "community-#{single}-#{suffix}", expected_comment_avatars("community")) do
          extract_channel_community(comment_avatar_fixture("community_posts").as_a,
            ucid: "UCXuqSBlHAE6Xw-yeJA0Tunw", locale: "en-US", format: format, thin_mode: thin, is_single_post: single)
        end
      end
    end
  end

  responses
end

def check_fetched_comment_avatars
  responses = {} of String => String
  calls = YoutubeAPI.avatar_listing_calls
  # Normal comments, explicit reply cursors and continuation pages keep one request.
  {nil, "fixture-reply-cursor", "fixture-next-page"}.each do |cursor|
    raw = comment_avatar_fixture("modern_comments").as_h
    if cursor
      items = raw["onResponseReceivedEndpoints"][0]["reloadContinuationItemsCommand"]["continuationItems"]
      if cursor == "fixture-reply-cursor"
        # Replies have one commentViewModel rather than the initial thread wrapper.
        items = JSON::Any.new(items.as_a.map do |item|
          view = item["commentThreadRenderer"]["commentViewModel"]["commentViewModel"]
          JSON::Any.new({"commentViewModel" => view})
        end)
      end
      raw["onResponseReceivedEndpoints"] = JSON.parse([{appendContinuationItemsAction: {continuationItems: items}}].to_json)
    end
    YoutubeAPI.avatar_listing_fixture = raw
    check_comment_avatar_response(responses, "fetch-#{cursor}", expected_comment_avatars("modern")) do
      Invidious::Comments.fetch_youtube("2isYuQZMbdU", cursor, "json", "en-US", true, nil)
    end
    calls += 1
    raise "Comment learning added metadata requests" unless YoutubeAPI.avatar_listing_calls == calls
  end

  # Older fetched replies use the same shared parsing/learning path.
  YoutubeAPI.avatar_listing_fixture = comment_avatar_fixture("legacy_replies").as_h
  check_comment_avatar_response(responses, "fetch-legacy-reply", expected_comment_avatars("legacy")) do
    Invidious::Comments.fetch_youtube("2isYuQZMbdU", "fixture-reply-cursor", "json", "en-US", true, nil)
  end
  calls += 1

  legacy = comment_avatar_fixture("legacy_replies")["continuationContents"]["commentRepliesContinuation"]
  YoutubeAPI.avatar_listing_fixture = JSON.parse({continuationContents: {itemSectionContinuation: legacy}}.to_json).as_h
  check_comment_avatar_response(responses, "fetch-legacy-comments", expected_comment_avatars("legacy")) do
    Invidious::Comments.fetch_youtube("2isYuQZMbdU", "fixture-next-page", "json", "en-US", true, nil)
  end
  calls += 1

  items = comment_avatar_fixture("community_posts")
  listing = JSON.parse({contents: {twoColumnBrowseResultsRenderer: {tabs: [{tabRenderer: {selected: true, content: {sectionListRenderer: {contents: [{itemSectionRenderer: {contents: items}}]}}}}]}}}.to_json).as_h
  YoutubeAPI.avatar_listing_fixture = listing
  check_comment_avatar_response(responses, "fetch-community", expected_comment_avatars("community")) do
    fetch_channel_community("UCXuqSBlHAE6Xw-yeJA0Tunw", nil, "en-US", "json", true)
  end
  calls += 1
  check_comment_avatar_response(responses, "fetch-single-post", expected_comment_avatars("community")) do
    fetch_channel_community_post("UCXuqSBlHAE6Xw-yeJA0Tunw", "post-fixture", "en-US", "html", true)
  end
  calls += 1

  YoutubeAPI.avatar_listing_fixture = JSON.parse({continuationContents: {itemSectionContinuation: {contents: items}}}.to_json).as_h
  check_comment_avatar_response(responses, "fetch-community-continuation", expected_comment_avatars("community")) do
    fetch_channel_community("UCXuqSBlHAE6Xw-yeJA0Tunw", "fixture-next-page", "en-US", "json", true)
  end
  calls += 1

  YoutubeAPI.avatar_listing_fixture = comment_avatar_fixture("modern_comments").as_h
  check_comment_avatar_response(responses, "fetch-post-comments", expected_comment_avatars("modern")) do
    raw = Invidious::Comments.fetch_community_post_comments("UCXuqSBlHAE6Xw-yeJA0Tunw", "post-fixture")
    Invidious::Comments.parse_youtube("post-fixture", raw, "json", "en-US", true, is_post: true)
  end
  calls += 1
  raise "Community/reply learning added metadata requests" unless YoutubeAPI.avatar_listing_calls == calls
ensure
  YoutubeAPI.avatar_listing_fixture = nil
end

def check_comment_avatar_edges
  cache = Invidious::Database::ChannelAvatars
  responses = {} of String => String
  empty = {} of String => String
  {"json", "html"}.each do |format|
    check_comment_avatar_response(responses, "empty-comments-#{format}", empty) do
      raw = JSON.parse(%({"onResponseReceivedEndpoints":[{"appendContinuationItemsAction":{"continuationItems":[]}}]})).as_h
      Invidious::Comments.parse_youtube("2isYuQZMbdU", raw, format, "en-US", false)
    end
    check_comment_avatar_response(responses, "absent-comments-#{format}", empty) do
      raw = JSON.parse(%({"onResponseReceivedEndpoints":[{"reloadContinuationItemsCommand":{"slot":"RELOAD_CONTINUATION_SLOT_BODY"}}]})).as_h
      Invidious::Comments.parse_youtube("2isYuQZMbdU", raw, format, "en-US", false)
    end
    check_comment_avatar_response(responses, "empty-posts-#{format}", empty) do
      extract_channel_community([JSON.parse("{}")], ucid: "UCXuqSBlHAE6Xw-yeJA0Tunw", locale: "en-US", format: format, thin_mode: true)
    end
  end

  {"", "https://example.com/unsupported-avatar", "https://yt3.ggpht.com/"}.each do |url|
    check_comment_avatar_response(responses, "invalid-comment-avatar-#{url}", empty) do
      raw = comment_avatar_fixture("modern_comments").as_h
      raw["frameworkUpdates"]["entityBatchUpdate"]["mutations"].as_a.each do |mutation|
        if author = mutation.dig?("payload", "commentEntityPayload", "author")
          author.as_h["avatarThumbnailUrl"] = JSON::Any.new(url)
        end
      end
      parsed = Invidious::Comments.parse_youtube("2isYuQZMbdU", raw, "json", "en-US", false)
      raise "Invalid optional avatars lost comments" unless JSON.parse(parsed)["comments"].as_a.size == 3
      parsed
    end
  end
  check_comment_avatar_response(responses, "unidentified-posts", empty) do
    items = comment_avatar_fixture("community_posts").as_a
    items.each do |item|
      item["backstagePostThreadRenderer"]["post"]["backstagePostRenderer"]["authorEndpoint"]["browseEndpoint"].as_h["browseId"] = JSON::Any.new("")
    end
    parsed = extract_channel_community(items, ucid: "UCXuqSBlHAE6Xw-yeJA0Tunw", locale: "en-US", format: "json", thin_mode: false)
    raise "Unidentified posts lost records or inferred parent identity" unless JSON.parse(parsed)["comments"].as_a.all? { |post| post["authorId"].as_s.empty? }
    parsed
  end

  # Learn-only does not fill missing author images even when the cache has one.
  id = expected_comment_avatars("modern").keys.first
  cache.observe({id => "https://yt3.ggpht.com/previous=s48"})
  raw = comment_avatar_fixture("modern_comments").as_h
  author = raw["frameworkUpdates"]["entityBatchUpdate"]["mutations"][0]["payload"]["commentEntityPayload"]["author"]
  author.as_h["avatarThumbnailUrl"] = JSON::Any.new("")
  reads = cache.comment_avatar_reads
  response = JSON.parse(Invidious::Comments.parse_youtube("2isYuQZMbdU", raw, "json", "en-US", false))
  raise "Missing avatar filled from cache" unless response["comments"][0]["authorThumbnail"].as_s.empty?
  raise "Missing avatar learning read cache" unless cache.comment_avatar_reads == reads
  raise "Missing avatar erased earlier cache" unless cache.select([id])[id] == "/ggpht/previous=s88"

  writes = cache.comment_avatar_writes
  raw = comment_avatar_fixture("modern_comments").as_h
  raw["frameworkUpdates"]["entityBatchUpdate"]["mutations"][0]["payload"]["commentEntityPayload"]["author"].as_h.delete("displayName")
  begin
    Invidious::Comments.parse_youtube("2isYuQZMbdU", raw, "json", "en-US", false)
    raise "Invalid mandatory author unexpectedly parsed"
  rescue KeyError
  end
  raise "Incomplete JSON construction wrote cache" unless cache.comment_avatar_writes == writes

  # Exercise a real optional database failure through the normal fetch boundary.
  PG_DB.exec("DROP TABLE channel_avatars")
  reads = cache.comment_avatar_reads
  calls = YoutubeAPI.avatar_listing_calls
  YoutubeAPI.avatar_listing_fixture = comment_avatar_fixture("modern_comments").as_h
  response = Invidious::Comments.fetch_youtube("2isYuQZMbdU", nil, "json", "en-US", false, nil)
  raise "Cache failure changed comments" unless comment_avatar_output_digest(response) == comment_avatar_fixture("baseline_output_digests")["modern-json-false"].as_s
  raise "Cache failure retried metadata" unless YoutubeAPI.avatar_listing_calls == calls + 1
  raise "Cache failure retried cache write" unless cache.comment_avatar_writes == writes + 1
  raise "Cache failure read cache" unless cache.comment_avatar_reads == reads
  # Also ensure community HTML survives the failed write.
  writes = cache.comment_avatar_writes
  response = extract_channel_community(comment_avatar_fixture("community_posts").as_a, ucid: "UCXuqSBlHAE6Xw-yeJA0Tunw", locale: "en-US", format: "html", thin_mode: false)
  raise "Cache failure changed community HTML" unless comment_avatar_output_digest(response) == comment_avatar_fixture("baseline_output_digests")["community-false-html-false"].as_s
  raise "Community cache failure retried write" unless cache.comment_avatar_writes == writes + 1
ensure
  YoutubeAPI.avatar_listing_fixture = nil
  PG_DB.exec("CREATE TABLE IF NOT EXISTS channel_avatars (ucid TEXT PRIMARY KEY, url TEXT NOT NULL, observed_at TEXT NOT NULL)")
end

def comment_avatar_cross_page_fixture(theme, thin = false)
  env = fixture_env("/feed/subscriptions", thin: thin, visual_theme: theme)
  locale = "en-US"
  modern = JSON.parse(Invidious::Comments.parse_youtube("2isYuQZMbdU", comment_avatar_fixture("modern_comments").as_h, "json", locale, true))["comments"].as_a
  community = JSON.parse(extract_channel_community(comment_avatar_fixture("community_posts").as_a, ucid: "UCXuqSBlHAE6Xw-yeJA0Tunw", locale: locale, format: "json", thin_mode: true))["comments"].as_a.first(1)
  items = (modern + community).map_with_index do |author, index|
    # These subscription cards contain no supplied avatar, so they require cache reuse.
    ChannelVideo.new({title: "An avatar learned from an existing comment or post", id: "comment#{index}", author: author["author"].as_s, ucid: author["authorId"].as_s,
                      published: Time.utc, updated: Time.utc, views: 100_i64, length_seconds: 100, live_now: false, premiere_timestamp: nil, members_only: false})
  end
  navbar_search = true
  page_nav_html = ""
  render "src/invidious/views/components/items_paginated.ecr", "src/invidious/views/template.ecr"
end

calls = YoutubeAPI.avatar_listing_calls
metadata_calls = Invidious::Videos::Parser.avatar_metadata_calls
responses = comment_avatar_response_cases
baseline = comment_avatar_fixture("baseline_output_digests").as_h
raise "Baseline case count changed" unless responses.keys.sort == baseline.keys.sort
responses.each do |label, response|
  raise "#{label}: JSON/HTML output changed" unless comment_avatar_output_digest(response) == baseline[label].as_s
end
raise "Parsing requested metadata" unless YoutubeAPI.avatar_listing_calls == calls && Invidious::Videos::Parser.avatar_metadata_calls == metadata_calls
check_fetched_comment_avatars
check_comment_avatar_edges
calls = YoutubeAPI.avatar_listing_calls
output = ENV["FRONTEND_FIXTURES"]? || "tests/frontend/.generated"
{"modern", "legacy"}.each do |kind|
  {false, true}.each do |thin|
    File.write("#{output}/comment-avatar-#{kind}-#{thin}.json", responses["#{kind}-html-#{thin}"])
  end
end
{"modern-neon", "diary"}.each do |theme|
  File.write("#{output}/avatars-comments-#{theme}.html", comment_avatar_cross_page_fixture(theme))
end
File.write("#{output}/avatars-comments-thin.html", comment_avatar_cross_page_fixture("modern-neon", true))
expected = expected_comment_avatars("modern").merge(expected_comment_avatars("community"))
raise "Real supplied avatars unavailable in shared cache" unless Invidious::Database::ChannelAvatars.select(expected.keys) == expected
raise "Cross-page reuse requested metadata" unless YoutubeAPI.avatar_listing_calls == calls && Invidious::Videos::Parser.avatar_metadata_calls == metadata_calls
puts "Comment/community avatars: #{expected.size} real channels learned; 20 unchanged JSON/HTML cases; batch writes, no learning reads, fetched continuations/replies, thin mode and cache failures passed"

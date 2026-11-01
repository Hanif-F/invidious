# Production presentation helpers with injected optional services; no upstream IO.
private class WatchEnhancementStorage < Invidious::AiSList::Storage
  getter lists = {} of String => Tuple(String, Time)

  def load_lists : Hash(String, Tuple(String, Time))
    @lists.dup
  end

  def save_list(kind : String, body : String, updated_at : Time) : Nil
    @lists[kind] = {body, updated_at}
  end

  def load_handles(ids : Array(String)) : Hash(String, Invidious::AiSList::HandleEntry)
    {} of String => Invidious::AiSList::HandleEntry
  end

  def save_handles(entries : Hash(String, Invidious::AiSList::HandleEntry)) : Nil
    nil
  end
end

def write_watch_enhancement_fixtures(output)
  previous_runtime = Invidious::AiSList.runtime
  storage = WatchEnhancementStorage.new
  storage.save_list("blocklist", "UC#{"a" * 22}\n", Time.utc)
  storage.save_list("warnlist", "UC#{"b" * 22}\n", Time.utc)
  lists = Invidious::AiSList::Lists.new(storage)
  lists.restore
  resolver_calls = 0
  resolver = Invidious::AiSList::Resolver.new(storage, ->(_id : String) { resolver_calls += 1; nil.as(String?) })
  Invidious::AiSList.fixture_runtime = Invidious::AiSList::Runtime.new(lists, resolver)
  title_calls = [] of String
  client = Invidious::OriginalTitles::Client.new(->(id : String) {
    title_calls << id
    Invidious::OriginalTitles::Result.new("Selected original <literal> #{id}", 6.hours)
  })
  video = fixture_video
  video.ucid = "UC#{"a" * 22}"
  related = {"previous001" => 'a', "nextvideo01" => 'b', "abcdefghijk" => 'c'}.map do |id, letter|
    {"id" => id, "title" => "Source <literal> #{id}", "author" => "Creator #{letter}", "ucid" => "UC#{letter.to_s * 22}", "length_seconds" => "120", "members_only" => (letter == 'b').to_s}
  end
  video.info["relatedVideos"] = JSON.parse(related.to_json)
  {"all", "filtered", "ai", "empty"}.each do |kind|
    env = signed_in_env("/watch?v=#{video.id}")
    preferences = env.get("preferences").as(Preferences)
    preferences.show_original_title = kind != "all"
    preferences.show_member_videos = !{"filtered", "empty"}.includes?(kind)
    preferences.ai_filter_enabled = kind == "ai"
    preferences.ai_blocklist_recommendations_action = "hide"
    preferences.ai_warnlist_recommendations_action = "replace_thumbnail"
    preferences.ai_blocklist_other_pages_action = "replace_thumbnail"
    env.set "preferences", preferences
    env.set "original_title_selection", Invidious::OriginalTitles::Selection.new(preferences.show_original_title, client)
    blocked = kind == "empty" ? [video.ucid, "UC#{"c" * 22}"] : kind == "filtered" ? ["UC#{"c" * 22}"] : [] of String
    env.set "blocked_channels", blocked
    projection = Invidious::Frontend::WatchEnhancements.projection(env, video, [video.id, "previous001", video.id, "nextvideo01"], [video.ucid])
    document = XML.parse_html(projection[:recommendations])
    actual = document.xpath_nodes("//article").map(&.["data-video-id"])
    expected = kind == "empty" ? [] of String : kind == "all" ? related.map(&.["id"]) : kind == "filtered" ? ["previous001"] : ["nextvideo01", "abcdefghijk"]
    raise "Watch presentation filters changed precedence/order" unless actual == expected && projection[:nextVideo] == expected.first?
    raise "Discovery AI hide removed queue thumbnail presentation" unless (kind == "ai") == projection[:queueThumbnails].has_key?(video.ucid)
    raise "Disabled originals requested metadata" if kind == "all" && !title_calls.empty?
    fingerprint = Invidious::Frontend::Misc.browse_fingerprint(preferences, blocked: blocked)
    File.write("#{output}/d6-watch-content-#{kind}.json", projection.merge({profile: Invidious::BrowserProfiles.render_scope(env), browseFingerprint: fingerprint}).to_json)
    snapshot = Invidious::Frontend::EnhancementState.snapshot(preferences, Invidious::BrowserProfiles.render_scope(env), true, blocked, HMAC_KEY)
    File.write("#{output}/d6-watch-owner-#{kind}.json", snapshot.to_json)
    if kind == "empty"
      empty_video = video.dup
      empty_video.info = video.info.dup
      empty_video.info["relatedVideos"] = JSON.parse("[]")
      File.write("#{output}/d6-watch-content-empty-light.html", watch_fixture(env, nil, account: true, supplied_video: empty_video))
    end
    next unless kind == "all"
    {"light", "dark"}.each do |mode|
      preferences.dark_mode = mode
      env.set "preferences", preferences
      File.write("#{output}/d6-watch-content-initial-#{mode}.html", watch_fixture(env, nil, account: true, supplied_video: video))
      File.write("#{output}/d6-watch-content-queue-#{mode}.html", watch_fixture(env, "IVfixture", account: true, supplied_video: video))
    end
    queue_videos = [video.id, "previous001", video.id, "nextvideo01"].map_with_index do |id, index|
      {videoId: id, title: "Occurrence #{index + 1}", author: "A creator", authorId: video.ucid,
       index: index, indexId: (9_007_199_254_740_993_i64 + index).to_s(16), isMember: true, lengthSeconds: 120}
    end
    queue = JSON.parse({playlistId: "IVfixture", title: "Preserved occurrences", videoCount: 4, videos: queue_videos}.to_json)
    env.set "desktop_fragment", true
    html = template_playlist(queue, false, false, true, spoiler_env: env)
    File.write("#{output}/d6-watch-content-queue.json", {playlistHtml: html, nextVideo: "nextvideo01", index: 3, currentIndex: 2,
                                                         positions: queue_videos.to_h { |item| {item[:indexId].to_i64(16).to_s, item[:index] + 1} }, total: 4, currentOccurrence: "9007199254740995", currentRemoved: false}.to_json)
  end
  raise "AI ID matches triggered creator resolution" unless resolver_calls == 0
  raise "Original title collection did not coalesce/cache IDs" unless title_calls.uniq == title_calls && title_calls.size == 4
  puts "Watch presentation membership/block/AI precedence, originals/cache/disabled budgets and queue projections passed"
ensure
  Invidious::AiSList.fixture_runtime = previous_runtime.not_nil! if previous_runtime
end

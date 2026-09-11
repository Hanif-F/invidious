# Runs in the fixture harness: no database server or YouTube requests.
def check_playlist_volume
  legacy = Preferences.from_json(%({"volume":12,"speed":1.5}))
  raise "Legacy volume still serialized" if JSON.parse(legacy.to_json)["volume"]?
  raise "Speed changed" unless legacy.speed == 1.5
  raise "Legacy YAML volume still serialized" if Preferences.from_yaml("volume: 12").to_yaml.includes?("volume:")

  {"3 days ago" => true, "Streamed 2 weeks ago" => true, "Jul 10, 2020" => true,
   "2026 views" => false, "Not a date" => false, "Feb 99, 2020" => false, "" => false}.each do |date, known|
    item = JSON.parse({lockupViewModel: {
      rendererContext: {commandContext: {onTap: {innertubeCommand: {watchEndpoint: {videoId: "fixture0001", playlistId: "PLfixture", index: 0}}}}},
      metadata:        {lockupMetadataViewModel: {title: {content: "Video"}, metadata: {contentMetadataViewModel: {metadataRows: [
        {metadataParts: [{text: {content: "2024", commandRuns: [] of String}}, {text: {content: date}}]},
      ]}}}},
    }}.to_json)
    continuation = JSON.parse({response: {continuationContents: {playlistVideoListContinuation: {contents: [item]}}}}.to_json).as_h
    initial = JSON.parse({contents: {twoColumnBrowseResultsRenderer: {tabs: [{tabRenderer: {selected: true, content: {
      sectionListRenderer: {contents: [{itemSectionRenderer: {contents: [item]}}]},
    }}}]}}}.to_json).as_h
    action = JSON.parse({onResponseReceivedActions: [{appendContinuationItemsAction: {continuationItems: [item]}}]}.to_json).as_h
    [initial, continuation, action].each do |response|
      video = extract_playlist_videos("PLfixture", response).first.as(PlaylistVideo)
      raise "Incorrect publication presence for #{date}" unless video.published_known == known
      raise "Date parser changed" if known && (video.published - decode_date(date.sub(/\AStreamed /, ""))).abs > 2.seconds
      video.published = Time.utc - 3.days unless known # An old placeholder must also stay hidden.
      env = fixture_env("/playlist?list=PLfixture")
      locale = "en-US"
      item_position = 0
      item = video
      html = render "src/invidious/views/components/item.ecr"
      raise "Incorrect date visibility for #{date}" unless html.includes?("Shared") == known
      raise "DB columns changed" if PlaylistVideo.type_array.includes?("published_known")
    end
  end
  raise "Missing metadata produced date" unless playlist_publication_date(nil).nil?
end

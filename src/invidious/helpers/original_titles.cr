require "../original_titles"
require "html"

module Invidious::OriginalTitles
  def self.fetch(id : String) : Result
    return Result.new(nil, 10.minutes) unless valid_id?(id)
    make_client(URI.parse("https://www.youtube.com"), force_resolve: true) do |client|
      client.connect_timeout = 1.second
      client.read_timeout = 2.seconds
      url = URI.encode_www_form("https://www.youtube.com/watch?v=#{id}")
      result(client.get("/oembed?url=#{url}&format=json"))
    end
  end

  CLIENT = Client.new(
    ->(id : String) { OriginalTitles.fetch(id) },
    ->(ids : Array(String)) { Database::OriginalVideoTitles.select(ids) },
    ->(id : String, entry : Entry) { Database::OriginalVideoTitles.save(id, entry) })

  class Selection
    getter enabled : Bool
    getter titles = {} of String => String?

    def initialize(@enabled : Bool, @client : Client = CLIENT, budget : Time::Span = 5.seconds)
      @deadline = OriginalTitles.clock + budget
    end

    def prepare(ids : Array(String))
      return unless @enabled
      missing = ids.reject { |id| @titles.has_key?(id) }
      @titles.merge!(@client.resolve(missing, @deadline)) unless missing.empty?
    end

    def title(id : String, fallback : String) : String
      return fallback unless @enabled
      prepare([id]) unless @titles.has_key?(id)
      @titles[id]? || fallback
    end
  end

  # Public APIs retain their authentication rules; clients pass their choice explicitly.
  def self.api_path?(path : String) : Bool
    !!path.matches?(/\A\/api\/v1\/(?:videos\/|search(?:\/|$)|hashtag\/|channels\/|trending$|popular$|playlists\/|mixes\/|clips(?:\/|$)|auth\/(?:feed$|history$|playlists(?:\/|$)|clips(?:\/|$)|saved_playlists(?:\/|$)|notifications$))/)
  end

  def self.read_request?(env) : Bool
    {"GET", "HEAD"}.includes?(env.request.method) && (api_path?(env.request.path) || env.request.path.starts_with?("/feed/"))
  end

  def self.valid_query?(env) : Bool
    values = env.params.query.fetch_all("show_original_title")
    values.empty? || (values.size == 1 && {"true", "false"}.includes?(values.first))
  end

  def self.selection(env) : Selection
    if saved = env.get?("original_title_selection")
      return saved.as(Selection)
    end
    enabled = env.get?("original_titles_enabled").try(&.as(Bool))
    if enabled.nil? && env.request.path.matches?(/\A\/feed\/(?:channel|playlist)\//)
      enabled = CONFIG.default_user_preferences.show_original_title
    end
    enabled = env.get("preferences").as(Preferences).show_original_title if enabled.nil?
    if read_request?(env) && (value = env.params.query["show_original_title"]?)
      enabled = value == "true"
    end
    saved = Selection.new(enabled)
    env.set "original_title_selection", saved
    saved
  end

  def self.prepare(env, ids : Array(String))
    selection(env).prepare(ids)
  end

  def self.title(env, id : String, fallback : String) : String
    selection(env).title(id, fallback)
  end

  def self.json(env, body : String, selected : Selection = selection(env)) : String
    return body unless selected.enabled
    value = JSON.parse(body)
    videos = records(value)
    return body if videos.empty?
    if (root = value.as_h?) && (id = root["videoId"]?.try(&.as_s?)) && root["title"]?.try(&.as_s?)
      selected.prepare([id])
    end
    selected.prepare(videos.map { |video| (video["videoId"]? || video["video_id"]).as_s })
    apply(videos, selected.titles)
    value.to_json
  rescue JSON::ParseException
    body
  end

  def self.notification(env, body : String) : String
    json(env, body, Selection.new(selection(env).enabled))
  end

  def self.feed(env, body : String) : String
    selected = selection(env)
    return body unless selected.enabled
    document = XML.parse(body)
    entries = document.xpath_nodes("//*[local-name()='entry']").compact_map do |entry|
      id = entry.xpath_node("./*[local-name()='videoId']").try(&.content)
      {id, entry} if id && valid_id?(id)
    end
    selected.prepare(entries.map(&.[0]))
    entries.each do |id, entry|
      next unless original = selected.titles[id]?
      entry.xpath_nodes("./*[local-name()='title']|./*[local-name()='group']/*[local-name()='title']").each do |title|
        # libxml2 interprets entity references passed to xmlNodeSetContent.
        title.content = HTML.escape(original)
      end
    end
    document.to_xml
  rescue XML::Error
    body
  end

  def self.response(env, body : String) : String
    return body unless read_request?(env) && env.response.status_code == 200
    content_type = env.response.content_type || ""
    if content_type.starts_with?("application/json") && api_path?(env.request.path)
      json(env, body)
    elsif content_type.includes?("atom+xml")
      feed(env, body)
    else
      body
    end
  end
end

add_context_storage_type(Invidious::OriginalTitles::Selection)

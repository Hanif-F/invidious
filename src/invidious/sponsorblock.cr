require "http/client"
require "json"
require "yaml"
require "digest/sha256"

module Invidious::SponsorBlock
  record Result, segments : Array(Segment), ttl : Time::Span
  record Entry, segments : Array(Segment), expires : Time::Span

  def self.valid_id?(id : String) : Bool
    !!id.match(/\A[A-Za-z0-9_-]{11}\z/)
  end

  CATEGORIES = {"sponsor" => "#4caf50", "selfpromo" => "#ffeb3b", "interaction" => "#e91e63", "intro" => "#00bcd4", "outro" => "#2196f3", "preview" => "#3f51b5", "music_offtopic" => "#ff9800", "filler" => "#9c27b0"}

  struct Segment
    include JSON::Serializable
    getter id : String
    getter category : String
    getter start : Float64
    getter end : Float64

    def initialize(@id, @category, @start, @end)
    end
  end

  def self.parse(body : String, id : String) : Array(Segment)
    result = [] of Segment
    JSON.parse(body).as_a.each do |video|
      next unless video["videoID"]?.try(&.as_s?) == id
      video["segments"].as_a.each do |raw|
        begin
          category = raw["category"].as_s
          next unless CATEGORIES.has_key?(category) && raw["actionType"].as_s == "skip"
          start = raw["segment"][0].as_f
          finish = raw["segment"][1].as_f
          next unless start.finite? && finish.finite? && start >= 0 && finish > start
          result << Segment.new(raw["UUID"].as_s, category, start, finish)
        rescue
          # A malformed segment must not discard other usable segments.
        end
      end
    end
    result.uniq(&.id).sort_by(&.start)
  end

  def self.fetch(id : String) : Result
    client = HTTP::Client.new(URI.parse("https://sponsor.ajay.app"))
    client.connect_timeout = 2.seconds
    client.read_timeout = 3.seconds
    begin
      prefix = Digest::SHA256.hexdigest(id)[0, 4]
      response = client.get("/api/skipSegments/#{prefix}?categories=#{URI.encode_www_form(CATEGORIES.keys.to_json)}&actionType=skip")
      result(response, id)
    ensure
      client.close
    end
  end

  def self.result(response : HTTP::Client::Response, id : String) : Result
    return Result.new([] of Segment, 10.minutes) if response.status_code == 404
    return Result.new([] of Segment, 30.seconds) unless response.status_code == 200
    segments = parse(response.body, id)
    Result.new(segments, segments.empty? ? 10.minutes : 1.hour)
  end

  # Keep monotonic expiration compatible with both older and newer Crystal releases.
  {% if Time.class.has_method?(:instant) %}
    CLOCK_START = Time.instant
  {% end %}

  def self.clock : Time::Span
    {% if Time.class.has_method?(:instant) %}
      Time.instant - CLOCK_START
    {% else %}
      Time.monotonic
    {% end %}
  end

  class Client
    @cache = Hash(String, Entry).new
    @pending = Hash(String, ::Channel(Nil)).new
    @mutex = Mutex.new
    @slots = ::Channel(Nil).new(4)

    def initialize(@fetcher : Proc(String, Result) = ->(id : String) { SponsorBlock.fetch(id) },
                   @clock : Proc(Time::Span) = -> { SponsorBlock.clock }, @capacity : Int32 = 10_000)
      4.times { @slots.send(nil) }
    end

    def segments(id : String) : Array(Segment)
      return [] of Segment unless SponsorBlock.valid_id?(id)
      loop do
        leader = false
        signal = @mutex.synchronize do
          if cached = @cache[id]?
            return cached.segments if cached.expires > @clock.call
            @cache.delete(id)
          end
          @pending[id]? || begin
            leader = true
            @pending[id] = ::Channel(Nil).new
          end
        end
        unless leader
          signal.receive?
          next
        end

        @slots.receive
        result = begin
          @fetcher.call(id)
        rescue
          # Short failure caching prevents an outage from producing request storms.
          Result.new([] of Segment, 30.seconds)
        ensure
          @slots.send(nil)
        end
        @mutex.synchronize do
          @cache.shift if @cache.size >= @capacity
          @cache[id] = Entry.new(result.segments, @clock.call + result.ttl)
          @pending.delete(id)
          signal.close
        end
        return result.segments
      end
    end
  end

  CLIENT = Client.new
end

module Invidious::SponsorBlock::Modes
  def self.normalize(raw : Hash(String, String)) : Hash(String, String)
    Invidious::SponsorBlock::CATEGORIES.to_h do |category, color|
      value = raw[category]? || "manual"
      {category, {"auto", "manual", "marker", "disabled"}.includes?(value) ? value : "manual"}
    end
  end

  def self.from_json(parser : JSON::PullParser) : Hash(String, String)
    raw = {} of String => String
    JSON::Any.new(parser).as_h?.try &.each { |key, value| value.as_s?.try { |text| raw[key] = text } }
    normalize(raw)
  end

  def self.to_json(value : Hash(String, String), json : JSON::Builder)
    normalize(value).to_json(json)
  end

  def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Hash(String, String)
    raw = {} of String => String
    if node.is_a?(YAML::Nodes::Mapping)
      node.nodes.each_slice(2) do |pair|
        key, value = pair
        if key.is_a?(YAML::Nodes::Scalar) && value.is_a?(YAML::Nodes::Scalar)
          raw[key.value] = value.value
        end
      end
    end
    normalize(raw)
  end

  def self.to_yaml(value : Hash(String, String), yaml : YAML::Nodes::Builder)
    normalize(value).to_yaml(yaml)
  end
end

module Invidious::SponsorBlock::Colors
  def self.normalize(raw : Hash(String, String)) : Hash(String, String)
    Invidious::SponsorBlock::CATEGORIES.to_h do |category, color|
      value = raw[category]? || color
      {category, !!value.match(/\A#[0-9a-fA-F]{6}\z/) ? value : color}
    end
  end

  def self.from_json(parser : JSON::PullParser) : Hash(String, String)
    raw = {} of String => String
    JSON::Any.new(parser).as_h?.try &.each { |key, value| value.as_s?.try { |text| raw[key] = text } }
    normalize(raw)
  end

  def self.to_json(value : Hash(String, String), json : JSON::Builder)
    normalize(value).to_json(json)
  end

  def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Hash(String, String)
    raw = {} of String => String
    if node.is_a?(YAML::Nodes::Mapping)
      node.nodes.each_slice(2) do |pair|
        key, value = pair
        if key.is_a?(YAML::Nodes::Scalar) && value.is_a?(YAML::Nodes::Scalar)
          raw[key.value] = value.value
        end
      end
    end
    normalize(raw)
  end

  def self.to_yaml(value : Hash(String, String), yaml : YAML::Nodes::Builder)
    normalize(value).to_yaml(yaml)
  end
end

module Invidious::SponsorBlock
  struct ChannelOverride
    include JSON::Serializable
    include YAML::Serializable
    property name : String
    property enabled : Bool?
    property modes : Hash(String, String)

    def initialize(@name : String, @enabled : Bool?, @modes : Hash(String, String))
    end
  end

  def self.channel_id(input : String) : String?
    value = input.strip
    return value if value.matches?(/\AUC[A-Za-z0-9_-]{22}\z/)
    path = URI.parse(value).path
    path.match(/\A\/channel\/(UC[A-Za-z0-9_-]{22})\/?\z/).try &.[1]
  rescue URI::Error
    nil
  end

  module ChannelOverrides
    def self.normalize(raw : JSON::Any) : Hash(String, ChannelOverride)
      result = {} of String => ChannelOverride
      raw.as_h?.try &.each do |id, value|
        next unless id.matches?(/\AUC[A-Za-z0-9_-]{22}\z/)
        next unless fields = value.as_h?
        modes = {} of String => String
        fields["modes"]?.try(&.as_h?).try &.each do |category, mode|
          text = mode.as_s?
          if CATEGORIES.has_key?(category) && {"auto", "manual", "marker", "disabled"}.includes?(text)
            modes[category] = text.not_nil!
          end
        end
        enabled = fields["enabled"]?.try &.as_bool?
        next if enabled.nil? && modes.empty?
        result[id] = ChannelOverride.new(fields["name"]?.try(&.as_s?) || id, enabled, modes)
      end
      result
    end

    def self.from_json(parser : JSON::PullParser)
      normalize(JSON::Any.new(parser))
    end

    def self.to_json(value, json : JSON::Builder)
      value.to_json(json)
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node)
      normalize(JSON.parse(YAML::Any.new(ctx, node).to_json))
    end

    def self.to_yaml(value, yaml : YAML::Nodes::Builder)
      value.to_yaml(yaml)
    end
  end

  def self.effective(enabled : Bool, modes : Hash(String, String), override : ChannelOverride?)
    return {enabled, modes} unless override
    {override.enabled.nil? ? enabled : override.enabled.not_nil!, modes.merge(override.modes)}
  end
end

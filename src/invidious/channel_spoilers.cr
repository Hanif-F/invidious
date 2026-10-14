require "json"
require "yaml"

module Invidious::ChannelSpoilers
  extend self

  struct Rule
    include JSON::Serializable
    include YAML::Serializable
    property name : String
    property hide_title : Bool
    property hide_thumbnail : Bool
    property reveal_after_days : Int32?

    def initialize(@name : String, @hide_title : Bool, @hide_thumbnail : Bool, @reveal_after_days : Int32? = nil)
    end

    def initialize
      @name = ""
      @hide_title = false
      @hide_thumbnail = false
      @reveal_after_days = nil
    end

    def active?(published : Time?, now = Time.utc) : Bool
      return false unless hide_title || hide_thumbnail
      return true unless days = reveal_after_days
      published.nil? || now.to_unix < published.to_unix + days.to_i64 * 86_400
    end
  end

  def publication(value : String?) : Time?
    return nil if value.nil? || value.empty?
    date = value.includes?('T') ? Time.parse_rfc3339(value) : Time.parse(value, "%Y-%m-%d", Time::Location::UTC)
    date >= Time.utc(2005, 1, 1) ? date.to_utc : nil
  rescue
    nil
  end

  def publication(value : Time?) : Time?
    value && value >= Time.utc(2005, 1, 1) ? value : nil
  end

  def video_publication(info : Hash(String, JSON::Any)) : Time?
    return nil unless info["publishedIsKnown"]?.try(&.as_bool?) == true
    publication((info["sourcePublished"]? || info["published"]?).try(&.as_s?))
  end

  module Rules
    def self.normalize(raw : JSON::Any) : Hash(String, Rule)
      result = {} of String => Rule
      raw.as_h?.try &.first(1000).each do |id, entry|
        next unless id.matches?(/\AUC[A-Za-z0-9_-]{22}\z/) && (fields = entry.as_h?)
        title = fields["hide_title"]?.try(&.as_bool?) || false
        thumbnail = fields["hide_thumbnail"]?.try(&.as_bool?) || false
        next unless title || thumbnail
        days = fields["reveal_after_days"]?
        number = days.try(&.as_i64?)
        next if days && !days.raw.nil? && (number.nil? || number < 1 || number > Int32::MAX)
        name = fields["name"]?.try(&.as_s?) || id
        result[id] = Rule.new(name[0, 200], title, thumbnail, number.try(&.to_i32))
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
end

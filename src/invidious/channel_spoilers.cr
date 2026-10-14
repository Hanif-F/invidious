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
    @[JSON::Field(emit_null: true)]
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

  # Native edits replace one complete rule, never the account's whole map.
  def validate_patch(value : JSON::Any)
    entries = value.as_h
    raise ArgumentError.new("Too many channel rules") if entries.size > 1000
    entries.each do |id, entry|
      raise ArgumentError.new("Invalid channel") unless id.matches?(/\AUC[A-Za-z0-9_-]{22}\z/)
      next if entry.raw.nil?
      fields = entry.as_h
      raise ArgumentError.new("Invalid channel rule") unless (fields.keys - %w(hide_title hide_thumbnail reveal_after_days)).empty?
      fields["hide_title"].as_bool
      fields["hide_thumbnail"].as_bool
      if days = fields["reveal_after_days"]?
        raise ArgumentError.new("Invalid reveal delay") unless days.raw.nil? || (1..Int32::MAX).includes?(days.as_i64)
      end
    end
  end

  def merge_patch(stored : Hash(String, JSON::Any), value : JSON::Any, names : Hash(String, String))
    rules = Rules.normalize(stored["channel_spoiler_settings"]? || JSON::Any.new(nil))
    value.as_h.each do |id, entry|
      fields = entry.as_h?
      if fields.nil? || !(fields["hide_title"].as_bool || fields["hide_thumbnail"].as_bool)
        rules.delete(id)
      else
        name = rules[id]?.try(&.name) || names[id]? || id
        rules[id] = Rule.new(name[0, 200], fields["hide_title"].as_bool, fields["hide_thumbnail"].as_bool,
          fields["reveal_after_days"]?.try(&.as_i64?).try(&.to_i32))
      end
    end
    raise ArgumentError.new("Too many channel rules") if rules.size > 1000
    stored["channel_spoiler_settings"] = JSON.parse(rules.to_json)
  end

  def publication_ids(raw : String?) : Array(String)
    ids = (raw || "").split(',')
    raise ArgumentError.new("Provide 1–100 distinct video IDs") unless (1..100).includes?(ids.size) &&
                                                                       ids.uniq.size == ids.size && ids.all? { |id| id.matches?(/\A[A-Za-z0-9_-]{11}\z/) }
    ids
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

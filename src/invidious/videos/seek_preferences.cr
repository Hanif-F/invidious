require "json"
require "yaml"

# Fixed jumps always use video timeline seconds, independent of playback speed.
module Invidious::Videos::SeekPreferences
  CHOICES = {5, 10, 20, 30}
  DEFAULT = 10

  def self.normalize(value : Int) : Int32
    CHOICES.includes?(value) ? value.to_i32 : DEFAULT
  end

  def self.from_json(pull : JSON::PullParser) : Int32
    normalize(JSON::Any.new(pull).as_i64? || DEFAULT)
  end

  def self.to_json(value : Int32, json : JSON::Builder)
    json.number normalize(value)
  end

  def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Int32
    normalize(YAML::Any.new(ctx, node).as_i64? || DEFAULT)
  end

  def self.to_yaml(value : Int32, yaml : YAML::Nodes::Builder)
    normalize(value).to_yaml(yaml)
  end
end

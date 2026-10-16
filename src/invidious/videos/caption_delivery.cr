require "uri"

module Invidious::Videos::CaptionDelivery
  class UpstreamError < Exception
    getter status : Int32

    def initialize(message : String, @status = 502)
      super(message)
    end
  end

  def self.companion_path(base_path : String, id : String, params : URI::Params, check : String) : String
    query = URI::Params.new
    {"label", "lang", "region"}.each { |key| query[key] = params[key] if params.has_key?(key) }
    query["check"] = check
    "#{base_path.rstrip('/')}/api/v1/captions/#{id}?#{query}"
  end

  def self.validate(body : String) : String
    text = body.lchop('\uFEFF').gsub("\r\n", "\n")
    unless text.matches?(/\AWEBVTT(?:[ \t][^\n]*)?\n/)
      raise UpstreamError.new("Upstream returned an invalid caption file.")
    end
    # A valid header alone is not a usable subtitle track. Check real timings and
    # nonempty cue text; gaps between those cues remain entirely legitimate.
    usable = text.split(/\n[ \t]*\n/).any? do |block|
      lines = block.lines
      index = lines.index { |line| line.includes?(" --> ") }
      next false unless index
      timing = lines[index].match(/\A((?:\d{2,}:)?\d{2}:\d{2}\.\d{3}) --> ((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})(?:[ \t].*)?\z/)
      next false unless timing
      start = timestamp(timing[1])
      finish = timestamp(timing[2])
      start && finish && finish > start && lines.skip(index + 1).any? { |line| !line.gsub(/<[^>]*>/, "").strip.empty? }
    end
    raise UpstreamError.new("Upstream returned captions without timed text.") unless usable
    body
  end

  private def self.timestamp(value : String) : Float64?
    parts = value.split(':').map(&.to_f64)
    return nil if parts[-1] >= 60 || parts[-2] >= 60
    parts.reverse.each_with_index.sum { |n, i| n * (60 ** i) }
  end

  def self.response(status : Int32, body : String) : String
    unless status == 200
      code = {404, 503}.includes?(status) ? status : 502
      raise UpstreamError.new("Upstream captions are unavailable (HTTP #{status}).", code)
    end
    validate(body)
  end

  def self.attachment(title : String) : String
    encoded = URI.encode_www_form(title)
    "attachment; filename=\"#{encoded}\"; filename*=UTF-8''#{encoded}"
  end
end

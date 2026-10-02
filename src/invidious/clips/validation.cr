module Invidious::Clips::Validation
  extend self

  def title(value : String) : String
    value = value.strip
    raise ArgumentError.new("Clip titles must contain 1–140 characters.") unless (1..140).includes?(value.size)
    value
  end

  def milliseconds(value : String) : Int64
    seconds = value.to_f64?
    raise ArgumentError.new("Invalid clip time.") unless seconds && seconds.finite? && seconds >= 0 && seconds < Int64::MAX / 1000
    (seconds * 1000).round.to_i64
  end

  def range(start_ms : Int64, end_ms : Int64, duration : Int32)
    raise ArgumentError.new("Clips must be between 5 and 120 seconds and within the source video.") unless start_ms >= 0 && end_ms <= duration.to_i64 * 1000 && (5_000..120_000).includes?(end_ms - start_ms)
  end

  def default_range(position : Float64, duration : Int32) : Tuple(Float64, Float64)
    position = 0.0 unless position.finite?
    length = Math.min(30.0, duration.to_f)
    start_time = (position - 15.0).clamp(0.0, duration - length)
    {start_time, start_time + length}
  end

  def native?(id : String) : Bool
    id.starts_with?("IVCL")
  end

  def valid_id?(id : String) : Bool
    id.matches?(/\AIVCL[a-zA-Z0-9_-]{32}\z/)
  end
end

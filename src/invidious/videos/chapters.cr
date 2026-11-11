# Only explicit description timestamps are used; never upstream automatic chapters.
module Invidious::Videos::Chapters
  def self.from_descriptions(short_description : String, description_html : String, duration : Int32)
    chapters = parse(short_description, duration)
    return chapters if !chapters.empty? || duration <= 0 || description_html.empty?

    # The attributed description can contain chapter links missing from the short description.
    lines = description_html.gsub(/<br\b[^>]*>|<\/(?:p|div)\s*>/i, "\n")
    parse(Invidious::Helpers.html_to_content(lines), duration)
  end

  def self.parse(description : String, duration : Int32)
    chapters = [] of NamedTuple(start: Int64, title: String)
    seen = Set(Int64).new
    description.each_line do |line|
      match = line.match(/^\s*(?:[-*•]\s+)?(\d+):(\d{2})(?::(\d{2}))?(?:\s+|\s*[-–—|]\s*)(.+?)\s*$/)
      next unless match
      first = match[1].to_i64?
      next unless first
      second = match[2].to_i
      third = match[3]?.try(&.to_i)
      next if second >= 60 || (third && third >= 60)
      # Bound before multiplication, including pathological description input.
      next if first > Int32::MAX
      start = third ? first * 3600 + second * 60 + third : first * 60 + second
      title = match[4].sub(/^[-–—|:]\s*/, "").strip
      next if title.empty? || start >= duration || !seen.add?(start)
      chapters << {start: start, title: title}
    end
    chapters.size >= 2 ? chapters.sort_by { |chapter| chapter[:start] } : chapters.clear
  end
end

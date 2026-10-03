module Invidious::History
  extend self

  def timezones : Array(String)
    zones = ["UTC"]
    if File.exists?("/usr/share/zoneinfo/zone.tab")
      File.each_line("/usr/share/zoneinfo/zone.tab") do |line|
        next if line.starts_with?('#')
        if zone = line.split('\t')[2]?
          zones << zone.strip
        end
      end
    end
    zones.uniq.sort
  end

  def timezone(value : String?) : String?
    return nil if value.nil? || value.empty?
    Time::Location.load(value)
    value
  rescue
    nil
  end

  def today(zone : String?, now : Time = Time.utc) : String
    now.in(Time::Location.load(timezone(zone) || "UTC")).to_s("%F")
  end

  def date(value : String?) : String?
    return nil unless value && value.matches?(/^\d{4}-\d{2}-\d{2}$/)
    Time.parse(value, "%F", Time::Location::UTC).to_s("%F")
  rescue
    nil
  end

  def matches?(title : String?, channel_name : String?, query : String) : Bool
    query = query.strip.downcase
    query.empty? || !!title.try(&.downcase.includes?(query)) || !!channel_name.try(&.downcase.includes?(query))
  end

  # Shared by the website and organized native API, before either paginates.
  def organize(entries, watched : Array(String), query : String, today : String)
    recency = watched.reverse.each_with_index.to_h
    groups = %w(history_today history_yesterday history_last_7_days history_last_30_days history_older)
    entries.select { |entry| matches?(entry.title, entry.channel_name, query) }.sort_by do |entry|
      {groups.index(group(entry.latest_watched, today)).not_nil!,
       entry.latest_watched.nil? ? 1 : 0,
       -(entry.latest_watched || "0000-00-00").delete('-').to_i64,
       recency[entry.video_id]? || Int32::MAX}
    end
  end

  def page(entries, page : Int32, size : Int32)
    offset = (page.clamp(1, Int32::MAX).to_i64 - 1) * size.clamp(0, Int32::MAX)
    # Array#skip subtracts into Int32; bound the offset before calling it.
    entries.skip(Math.min(offset, entries.size).to_i).first(size.clamp(0, Int32::MAX))
  end

  def group(watched : String?, today : String) : String
    return "history_older" unless watched
    days = (Time.parse(today, "%F", Time::Location::UTC) - Time.parse(watched, "%F", Time::Location::UTC)).days.to_i
    case days
    when 0     then "history_today"
    when 1     then "history_yesterday"
    when 2..6  then "history_last_7_days"
    when 7..29 then "history_last_30_days"
    else            "history_older"
    end
  end
end

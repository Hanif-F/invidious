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

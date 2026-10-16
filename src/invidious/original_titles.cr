require "http/client"
require "json"

# Original titles are presentation data, never replacements for source metadata.
module Invidious::OriginalTitles
  extend self

  record Result, title : String?, ttl : Time::Span
  record Entry, title : String?, expires_at : Time

  {% if Time.class.has_method?(:instant) %}
    CLOCK_START = Time.instant
  {% end %}

  def clock : Time::Span
    {% if Time.class.has_method?(:instant) %}
      Time.instant - CLOCK_START
    {% else %}
      Time.monotonic
    {% end %}
  end

  def valid_id?(id : String) : Bool
    !!id.matches?(/\A[A-Za-z0-9_-]{11}\z/)
  end

  def result(response : HTTP::Client::Response) : Result
    return Result.new(nil, 10.minutes) if {401, 403, 404}.includes?(response.status_code)
    return Result.new(nil, 30.seconds) unless response.status_code == 200
    value = JSON.parse(response.body)["title"]?
    return Result.new(nil, 30.seconds) if value && !value.raw.nil? && !value.as_s?
    title = value.try(&.as_s?)
    return Result.new(nil, 10.minutes) if title.nil? || title.blank?
    return Result.new(nil, 30.seconds) if title.each_char.any? { |char| char.ord < 32 && !{'\t', '\n', '\r'}.includes?(char) }
    Result.new(title, 6.hours)
  rescue
    Result.new(nil, 30.seconds)
  end

  # Only actual video records have their title selected. In particular, clipTitle,
  # playlist names, channels and arbitrary strings are never rewritten.
  def records(value : JSON::Any, found = [] of Hash(String, JSON::Any))
    if array = value.as_a?
      array.each { |child| records(child, found) }
    elsif object = value.as_h?
      id = object["videoId"]?.try(&.as_s?) || object["video_id"]?.try(&.as_s?)
      if id && valid_id?(id) && object["title"]?.try(&.as_s?) && !object.has_key?("clipId")
        found << object
      end
      object.each_value { |child| records(child, found) if child.as_a? || child.as_h? }
    end
    found
  end

  def apply(records : Array(Hash(String, JSON::Any)), titles : Hash(String, String?))
    records.each do |record|
      id = (record["videoId"]? || record["video_id"]).as_s
      if title = titles[id]?
        record["title"] = JSON::Any.new(title)
      end
    end
  end

  class Client
    @cache = {} of String => Entry
    @pending = {} of String => ::Channel(Nil)
    @mutex = Mutex.new
    @slots = ::Channel(Nil).new(4)

    def initialize(@fetcher : Proc(String, Result),
                   @lookup : Proc(Array(String), Hash(String, Entry)) = ->(_ids : Array(String)) { {} of String => Entry },
                   @save : Proc(String, Entry, Nil) = ->(_id : String, _entry : Entry) { nil },
                   @clock : Proc(Time::Span) = -> { OriginalTitles.clock },
                   @now : Proc(Time) = -> { Time.utc }, @capacity : Int32 = 10_000)
      4.times { @slots.send(nil) }
    end

    def resolve(ids : Array(String), deadline : Time::Span) : Hash(String, String?)
      ids = ids.select { |id| OriginalTitles.valid_id?(id) }.uniq
      titles = ids.to_h { |id| {id, nil.as(String?)} }
      missing = ids.reject do |id|
        if entry = cached(id)
          titles[id] = entry.title
          true
        else
          false
        end
      end
      return titles if missing.empty? || @clock.call >= deadline
      stored = lookup(missing, deadline)
      missing = missing.reject do |id|
        if (entry = stored[id]?) && entry.expires_at > @now.call
          remember(id, entry)
          titles[id] = entry.title
          true
        else
          false
        end
      end
      return titles if missing.empty? || @clock.call >= deadline

      completed = ::Channel({String, String?}).new(missing.size)
      index = 0
      work_mutex = Mutex.new
      Math.min(4, missing.size).times do
        spawn do
          loop do
            break if @clock.call >= deadline
            id = work_mutex.synchronize do
              candidate = missing[index]?
              index += 1
              candidate
            end
            break unless id
            completed.send({id, title(id, deadline)})
          end
        end
      end
      missing.size.times do
        remaining = deadline - @clock.call
        break if remaining <= Time::Span.zero
        select
        when pair = completed.receive
          titles[pair[0]] = pair[1]
        when timeout(remaining)
          break
        end
      end
      # Optional cache writes may still be finishing after a title was fetched.
      missing.each do |id|
        if entry = cached(id)
          titles[id] = entry.title
        end
      end
      titles
    end

    private def lookup(ids : Array(String), deadline : Time::Span) : Hash(String, Entry)
      remaining = deadline - @clock.call
      return {} of String => Entry if remaining <= Time::Span.zero
      completed = ::Channel(Hash(String, Entry)).new(1)
      spawn do
        entries = begin
          @lookup.call(ids)
        rescue
          {} of String => Entry
        end
        completed.send(entries)
      end
      select
      when entries = completed.receive
        entries
      when timeout(remaining)
        {} of String => Entry
      end
    end

    private def cached(id : String) : Entry?
      @mutex.synchronize do
        entry = @cache[id]?
        return entry if entry && entry.expires_at > @now.call
        @cache.delete(id)
        nil
      end
    end

    private def remember(id : String, entry : Entry)
      @mutex.synchronize do
        @cache.shift if @cache.size >= @capacity && !@cache.has_key?(id)
        @cache[id] = entry
      end
    end

    private def title(id : String, deadline : Time::Span) : String?
      if entry = cached(id)
        return entry.title
      end
      leader = false
      signal = @mutex.synchronize do
        @pending[id]? || begin
          leader = true
          @pending[id] = ::Channel(Nil).new
        end
      end
      remaining = deadline - @clock.call
      unless leader
        return nil if remaining <= Time::Span.zero
        select
        when signal.receive?
          return cached(id).try(&.title)
        when timeout(remaining)
          return nil
        end
      end
      acquired = false
      begin
        return nil if remaining <= Time::Span.zero
        select
        when @slots.receive
          acquired = true
        when timeout(remaining)
          return nil
        end
        return nil if @clock.call >= deadline
        result = begin
          @fetcher.call(id)
        rescue
          Result.new(nil, 30.seconds)
        ensure
          @slots.send(nil)
          acquired = false
        end
        entry = Entry.new(result.title, @now.call + result.ttl)
        remember(id, entry)
        begin
          @save.call(id, entry)
        rescue
        end
        entry.title
      ensure
        @slots.send(nil) if acquired
        @mutex.synchronize do
          @pending.delete(id)
          signal.close
        end
      end
    end
  end
end

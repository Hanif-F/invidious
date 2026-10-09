require "http/client"
require "json"
require "set"
require "uri"

# Shared classification data and identity lookup. No user or viewing history is
# sent to AiSList; channel resolution uses the instance's existing YouTube client.
module Invidious::AiSList
  extend self

  KINDS            = %w(blocklist warnlist)
  REFRESH_INTERVAL = 6.hours
  HANDLE_TTL       = 7.days
  RETRY_INTERVAL   = 1.hour
  WAIT_BUDGET      = 2.seconds
  MAX_LIST_BYTES   = 2 * 1024 * 1024

  def valid_id?(id : String) : Bool
    id.matches?(/\AUC[A-Za-z0-9_-]{22}\z/)
  end

  def normalize_handle(value : String?) : String?
    return nil unless value
    handle = URI.decode(value.strip).unicode_normalize.downcase
    handle if handle.matches?(/\A@[\p{L}\p{M}\p{N}_.·-]{1,100}\z/)
  rescue
    nil
  end

  def handle_url(value : String?) : String?
    return nil unless value
    uri = URI.parse(value)
    return nil if uri.host && !{"youtube.com", "www.youtube.com", "m.youtube.com"}.includes?(uri.host)
    return nil if uri.scheme && !{"http", "https"}.includes?(uri.scheme)
    normalize_handle(uri.path.lchop('/'))
  rescue
    nil
  end

  # Inspect navigation endpoints only. A handle must be linked to this exact UC
  # identity; titles, descriptions and unrelated creators cannot supply one.
  def author_handle(node : JSON::Any?, id : String) : String?
    return nil unless node && valid_id?(id)
    handles = Set(String).new
    collect_handles(node, id, handles)
    handles.first? if handles.size == 1
  end

  def channel_handle(response : Hash(String, JSON::Any), id : String) : String?
    metadata = response.dig?("metadata", "channelMetadataRenderer")
    return nil unless valid_id?(id) && metadata.try(&.dig?("externalId")).try(&.as_s?) == id
    handle_url(metadata.try(&.dig?("vanityChannelUrl")).try(&.as_s?)) ||
      handle_url(metadata.try(&.dig?("channelUrl")).try(&.as_s?)) ||
      handle_url(response.dig?("microformat", "microformatDataRenderer", "urlCanonical").try(&.as_s?)) ||
      author_handle(response["header"]?, id)
  end

  private def collect_handles(node : JSON::Any, id : String, handles : Set(String))
    if object = node.as_h?
      if browse = object["browseEndpoint"]?.try(&.as_h?)
        if browse["browseId"]?.try(&.as_s?) == id
          url = browse["canonicalBaseUrl"]?.try(&.as_s?) || object.dig?("commandMetadata", "webCommandMetadata", "url").try(&.as_s?)
          handle_url(url).try { |handle| handles << handle }
        end
      end
      object.each_value { |child| collect_handles(child, id, handles) }
    elsif array = node.as_a?
      array.each { |child| collect_handles(child, id, handles) }
    end
  end

  record Entries, handles : Set(String), ids : Set(String) do
    def size : Int32
      handles.size + ids.size
    end

    def includes?(id : String, handle : String?) : Bool
      ids.includes?(id) || (!!handle && handles.includes?(handle))
    end
  end

  def parse(body : String) : Entries
    raise ArgumentError.new("Oversized AiSList") if body.bytesize > MAX_LIST_BYTES
    handles = Set(String).new
    ids = Set(String).new
    declared_empty = false
    body.each_line do |line|
      value = line.strip.lchop('\uFEFF')
      next if value.empty?
      if value.starts_with?('!')
        declared_empty ||= value.matches?(/\A! Total Channels:\s*0\z/i)
        next
      end
      if valid_id?(value)
        ids << value
      elsif handle = normalize_handle(value)
        handles << handle
      else
        raise ArgumentError.new("Invalid AiSList entry")
      end
    end
    raise ArgumentError.new("Empty AiSList") if handles.empty? && ids.empty? && !declared_empty
    Entries.new(handles, ids)
  end

  record Snapshot, body : String, entries : Entries, updated_at : Time
  record HandleEntry, handle : String?, checked_at : Time, expires_at : Time do
    def fresh?(now : Time) : Bool
      expires_at > now
    end
  end

  abstract class Storage
    abstract def load_lists : Hash(String, Tuple(String, Time))
    abstract def save_list(kind : String, body : String, updated_at : Time) : Nil
    abstract def load_handles(ids : Array(String)) : Hash(String, HandleEntry)
    abstract def save_handles(entries : Hash(String, HandleEntry)) : Nil
  end

  def fetch_list(kind : String) : String
    raise ArgumentError.new("Unknown AiSList") unless KINDS.includes?(kind)
    client = HTTP::Client.new(URI.parse("https://raw.githubusercontent.com"))
    client.connect_timeout = 5.seconds
    client.read_timeout = 10.seconds
    begin
      client.get("/Override92/AiSList/main/AiSList/aislist_#{kind}.txt") do |response|
        raise IO::Error.new("AiSList HTTP #{response.status_code}") unless response.status_code == 200
        buffer = IO::Memory.new
        IO.copy(response.body_io, buffer, MAX_LIST_BYTES + 1)
        body = buffer.to_s
        raise IO::Error.new("Oversized AiSList") if body.bytesize > MAX_LIST_BYTES
        return body
      end
    ensure
      client.close
    end
    raise IO::Error.new("Missing AiSList response")
  end

  class Lists
    @snapshots = {} of String => Snapshot
    @failed = Set(String).new
    @mutex = Mutex.new

    def initialize(@storage : Storage, @fetcher : Proc(String, String) = ->AiSList.fetch_list(String),
                   @now : Proc(Time) = -> { Time.utc })
    end

    def restore
      @storage.load_lists.each do |kind, stored|
        next unless KINDS.includes?(kind)
        begin
          snapshot = Snapshot.new(stored[0], AiSList.parse(stored[0]), stored[1])
          @mutex.synchronize { @snapshots[kind] = snapshot }
        rescue
          # A damaged persisted copy must not disable the other list.
        end
      end
    rescue
      # Optional caches must never prevent startup or preferences rendering.
    end

    def snapshot(kind : String) : Snapshot?
      @mutex.synchronize { @snapshots[kind]? }
    end

    def stale?(kind : String) : Bool
      @mutex.synchronize do
        snapshot = @snapshots[kind]?
        !snapshot || @failed.includes?(kind) || snapshot.updated_at + REFRESH_INTERVAL <= @now.call
      end
    end

    # Fetch and commit independently so a warnlist outage cannot discard a new
    # blocklist, and neither failure can erase a previously usable snapshot.
    def refresh : Array(String)
      failed = [] of String
      KINDS.each do |kind|
        begin
          body = @fetcher.call(kind)
          snapshot = Snapshot.new(body, AiSList.parse(body), @now.call)
          @storage.save_list(kind, body, snapshot.updated_at)
          @mutex.synchronize do
            @snapshots[kind] = snapshot
            @failed.delete(kind)
          end
        rescue
          @mutex.synchronize { @failed << kind }
          failed << kind
        end
      end
      failed
    end
  end

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

  def wait(signal : ::Channel(Nil), budget : Time::Span) : Nil
    select
    when signal.receive?
    when timeout(budget)
    end
  end

  class Resolver
    @cache = {} of String => HandleEntry
    @pending = {} of String => ::Channel(Nil)
    @queue = ::Channel(String).new(256)
    @started = false
    @mutex = Mutex.new

    def initialize(@storage : Storage, @fetcher : Proc(String, String?),
                   @now : Proc(Time) = -> { Time.utc },
                   @clock : Proc(Time::Span) = -> { AiSList.clock },
                   @waiter : Proc(::Channel(Nil), Time::Span, Nil) = ->AiSList.wait(::Channel(Nil), Time::Span))
    end

    def observe(handles : Hash(String, String))
      now = @now.call
      entries = {} of String => HandleEntry
      handles.each do |id, value|
        next unless AiSList.valid_id?(id)
        if handle = AiSList.normalize_handle(value)
          unchanged = @mutex.synchronize do
            (current = @cache[id]?) && current.fresh?(now) && current.handle == handle
          end
          next if unchanged
          entries[id] = HandleEntry.new(handle, now, now + HANDLE_TTL)
        end
      end
      store(entries)
    end

    def handles(ids : Array(String), budget : Time::Span = WAIT_BUDGET) : Hash(String, String)
      deadline = @clock.call + budget
      ids = ids.uniq.select { |id| AiSList.valid_id?(id) }
      missing = @mutex.synchronize { ids.reject { |id| @cache[id]?.try(&.fresh?(@now.call)) } }
      begin
        loaded = @storage.load_handles(missing) unless missing.empty?
        loaded.try &.each do |id, entry|
          @mutex.synchronize { cache(id, entry) unless @cache[id]?.try(&.fresh?(@now.call)) }
        end
      rescue
      end

      signals = [] of ::Channel(Nil)
      @mutex.synchronize do
        unless @started
          @started = true
          4.times { spawn { work } }
        end
        ids.each do |id|
          next if @cache[id]?.try(&.fresh?(@now.call))
          if signal = @pending[id]?
            signals << signal
          elsif @pending.size < 260
            signal = ::Channel(Nil).new
            @pending[id] = signal
            select
            when @queue.send(id)
              signals << signal
            else
              @pending.delete(id)
            end
          end
        end
      end
      signals.each do |signal|
        remaining = deadline - @clock.call
        break if remaining <= Time::Span.zero
        @waiter.call(signal, remaining)
      end
      @mutex.synchronize do
        ids.each_with_object({} of String => String) do |id, result|
          if (entry = @cache[id]?) && entry.fresh?(@now.call) && (handle = entry.handle)
            result[id] = handle
          end
        end
      end
    end

    private def cache(id : String, entry : HandleEntry)
      @cache.shift if !@cache.has_key?(id) && @cache.size >= 10_000
      @cache[id] = entry
    end

    private def store(entries : Hash(String, HandleEntry))
      return if entries.empty?
      @mutex.synchronize do
        entries.each do |id, entry|
          cache(id, entry) unless (current = @cache[id]?) && current.checked_at > entry.checked_at
        end
      end
      @storage.save_handles(entries)
    rescue
      # Results can still be used in memory when persistence is unavailable.
    end

    private def work
      loop do
        id = @queue.receive
        begin
          fresh = @mutex.synchronize { @cache[id]?.try(&.fresh?(@now.call)) }
          unless fresh
            started = @now.call
            handle = begin
              AiSList.normalize_handle(@fetcher.call(id))
            rescue
              nil
            end
            entry = HandleEntry.new(handle, started, @now.call + (handle ? HANDLE_TTL : RETRY_INTERVAL))
            store({id => entry})
          end
        ensure
          @mutex.synchronize { @pending.delete(id).try &.close }
        end
      end
    end
  end
end

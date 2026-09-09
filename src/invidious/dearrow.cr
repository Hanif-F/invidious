require "http/client"
require "json"
require "digest/sha256"

module Invidious::DeArrow
  record Result, title : String?, ttl : Time::Span
  record Entry, title : String?, expires : Time::Span

  def self.valid_id?(id : String) : Bool
    !!id.match(/\A[A-Za-z0-9_-]{11}\z/)
  end

  # The first result is ranked highest; do not promote a lower-ranked proposal
  # when the community has selected the original title instead.
  def self.parse(body : String, id : String) : String?
    branding = JSON.parse(body)[id]?
    return nil unless branding
    title = branding["titles"].as_a.first?
    return nil unless title
    return nil if title["original"].as_bool
    return nil unless title["locked"].as_bool || title["votes"].as_i >= 0
    title["title"].as_s.delete('>').strip.presence
  end

  def self.fetch(id : String) : Result
    client = HTTP::Client.new(URI.parse("https://sponsor.ajay.app"))
    client.connect_timeout = 2.seconds
    client.read_timeout = 3.seconds
    begin
      prefix = Digest::SHA256.hexdigest(id)[0, 4]
      response = client.get("/api/branding/#{prefix}")
      result(response, id)
    ensure
      client.close
    end
  end

  def self.result(response : HTTP::Client::Response, id : String) : Result
    return Result.new(nil, 10.minutes) if response.status_code == 404
    return Result.new(nil, 30.seconds) unless response.status_code == 200
    title = parse(response.body, id)
    Result.new(title, title ? 1.hour : 10.minutes)
  end

  # Keep monotonic expiration compatible with both older and newer Crystal releases.
  {% if Time.class.has_method?(:instant) %}
    CLOCK_START = Time.instant
  {% end %}

  def self.clock : Time::Span
    {% if Time.class.has_method?(:instant) %}
      Time.instant - CLOCK_START
    {% else %}
      Time.monotonic
    {% end %}
  end

  class Client
    @cache = Hash(String, Entry).new
    @pending = Hash(String, ::Channel(Nil)).new
    @mutex = Mutex.new
    @slots = ::Channel(Nil).new(4)

    def initialize(@fetcher : Proc(String, Result) = ->(id : String) { DeArrow.fetch(id) },
                   @clock : Proc(Time::Span) = -> { DeArrow.clock }, @capacity : Int32 = 10_000)
      4.times { @slots.send(nil) }
    end

    def title(id : String) : String?
      return nil unless DeArrow.valid_id?(id)
      loop do
        leader = false
        signal = @mutex.synchronize do
          if cached = @cache[id]?
            return cached.title if cached.expires > @clock.call
            @cache.delete(id)
          end
          @pending[id]? || begin
            leader = true
            @pending[id] = ::Channel(Nil).new
          end
        end
        unless leader
          signal.receive?
          next
        end

        @slots.receive
        result = begin
          @fetcher.call(id)
        rescue
          # Short failure caching prevents an outage from producing request storms.
          Result.new(nil, 30.seconds)
        ensure
          @slots.send(nil)
        end
        @mutex.synchronize do
          @cache.shift if @cache.size >= @capacity
          @cache[id] = Entry.new(result.title, @clock.call + result.ttl)
          @pending.delete(id)
          signal.close
        end
        return result.title
      end
    end
  end

  CLIENT = Client.new
end

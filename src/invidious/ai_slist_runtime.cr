require "./ai_slist"
require "./database/ai_slist"

module Invidious::AiSList
  class Runtime
    getter lists : Lists
    getter resolver : Resolver

    def initialize(@lists : Lists, @resolver : Resolver)
    end

    def initialize
      storage = Database::AiSListStorage.new
      @lists = Lists.new(storage)
      @lists.restore
      @resolver = Resolver.new(storage, ->(id : String) { AiSList.fetch_handle(id) })
    end
  end

  @@runtime : Runtime?
  @@runtime_mutex = Mutex.new

  def self.runtime : Runtime
    @@runtime_mutex.synchronize { @@runtime ||= Runtime.new }
  end

  def self.fetch_handle(id : String) : String?
    response = YoutubeAPI.browse(browse_id: id, params: "")
    channel_handle(response, id)
  end

  def self.observe_items(items)
    supplied = {} of String => String
    items.each do |item|
      if item.responds_to?(:author_handle)
        item.author_handle.try { |handle| supplied[item.ucid] = handle }
      elsif item.responds_to?(:channel_handle)
        item.channel_handle.try { |handle| supplied[item.ucid] = handle }
      end
    end
    runtime.resolver.observe(supplied) unless supplied.empty?
  end
end

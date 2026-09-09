module Invidious::Frontend::BlockedChannels
  extend self

  # Request-local storage: never personalize shared video or feed caches.
  def ids(env) : Array(String)
    if cached = env.get?("blocked_channels")
      return cached.as(Array(String))
    end
    user = env.get?("user").try &.as(User)
    blocked = user ? Database::BlockedChannels.ids(user.email) : [] of String
    env.set "blocked_channels", blocked
    blocked
  end

  def filter(items, blocked : Array(String))
    items.reject do |item|
      if item.responds_to?(:ucid)
        blocked.includes?(item.ucid.to_s)
      else
        false
      end
    end
  end

  def recommendations(items, blocked : Array(String))
    items.reject { |item| blocked.includes?(item["ucid"]? || "") }
  end
end

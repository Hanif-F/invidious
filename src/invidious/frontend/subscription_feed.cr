add_context_storage_type(Array(String))

module Invidious::Frontend::SubscriptionFeed
  extend self

  CHANNEL_SHORTCUT_LIMIT = 18

  SORTS       = {"published", "published - reverse", "alphabetically", "alphabetically - reverse", "channel name", "channel name - reverse"}
  SORT_LABELS = {
    "published"                => "overhaul_sort_newest",
    "published - reverse"      => "overhaul_sort_oldest",
    "alphabetically"           => "overhaul_sort_title_ascending",
    "alphabetically - reverse" => "overhaul_sort_title_descending",
    "channel name"             => "overhaul_sort_channel_ascending",
    "channel name - reverse"   => "overhaul_sort_channel_descending",
  }

  def channel_shortcuts(user : User, show_members : Bool, now : Time = Time.utc) : Array(InvidiousChannel)
    return [] of InvidiousChannel if user.subscriptions.empty?

    channels = Database::Channels.select(user.subscriptions).reject { |channel| channel.deleted || channel.author.blank? }
    return channels if channels.empty?

    stats = {} of String => SubscriptionManager::Stats
    stats = Database::SubscriptionManager.select(user, show_members, now) unless user.watched.empty?
    SubscriptionManager.sort(channels, stats, "relevance", now).first(CHANNEL_SHORTCUT_LIMIT)
  rescue ex : DB::Error | PG::Error | PQ::PQError | PQ::ConnectionError
    LOGGER.warn("Subscription shortcuts unavailable (#{ex.class})")
    [] of InvidiousChannel
  end

  # A feed view never writes account defaults. Explicit GET choices survive
  # pagination while the Library category remains the owner of saved defaults.
  def preferences(saved : Preferences, params : URI::Params, notifications_enabled : Bool) : Preferences
    result = saved
    {% for name in %w(latest_only unseen_only notifications_only) %}
      if value = params.fetch_all({{name}}).last?
        result.{{name.id}} = value == "1" if {"0", "1"}.includes?(value)
      end
    {% end %}
    result.notifications_only = false unless notifications_enabled
    if sort = params["sort"]?
      result.sort = sort if SORTS.includes?(sort)
    end
    result
  end

  def params(view : Preferences, max_results : Int) : URI::Params
    URI::Params{
      "sort" => view.sort, "max_results" => max_results.to_s,
      "latest_only" => view.latest_only ? "1" : "0",
      "unseen_only" => view.unseen_only ? "1" : "0",
      "notifications_only" => view.notifications_only ? "1" : "0",
    }
  end
end

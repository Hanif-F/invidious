require "./base.cr"

module Invidious::Database::Users
  extend self

  class PreferenceConflict < DB::Error
  end

  # -------------------
  #  Insert / delete
  # -------------------

  def insert(user : User, update_on_conflict : Bool = false, conn = PG_DB)
    user_array = user.to_a
    user_array[4] = user_array[4].to_json # User preferences

    request = <<-SQL
      INSERT INTO users (updated, notifications, subscriptions, email, preferences, password, token, watched, feed_needs_update, username, credential_version)
      VALUES (#{arg_array(user_array)})
      SQL

    if update_on_conflict
      request += <<-SQL
        ON CONFLICT (email) DO UPDATE
        SET updated = $1, subscriptions = $3
        SQL
    end

    conn.exec(request, args: user_array)
  end

  def delete(user : User)
    request = <<-SQL
      DELETE FROM users *
      WHERE email = $1
      SQL

    PG_DB.exec(request, user.email)
  end

  # -------------------
  #  Update (history)
  # -------------------

  def update_watch_history(user : User)
    PG_DB.transaction do |tx|
      conn = tx.connection
      current = conn.query_one("SELECT watched FROM users WHERE email = $1 FOR UPDATE", user.email, as: Array(String))
      merged = (current + user.watched).reverse.uniq!.reverse!
      conn.exec("UPDATE users SET watched = $1 WHERE email = $2", merged, user.email)
    end
  end

  def mark_watched(user : User, vid : String, video : Video? = nil)
    WatchHistory.record(user, vid, video)
  end

  def mark_unwatched(user : User, vid : String)
    PG_DB.transaction do |tx|
      conn = tx.connection
      conn.exec("UPDATE users SET watched = array_remove(watched, $1) WHERE email = $2", vid, user.email)
      conn.exec("DELETE FROM watch_history WHERE email = $1 AND video_id = $2", user.email, vid)
    end
  end

  def clear_watch_history(user : User, clear_positions = false)
    PG_DB.transaction do |tx|
      conn = tx.connection
      conn.exec("UPDATE users SET watched = '{}' WHERE email = $1", user.email)
      conn.exec("DELETE FROM watch_history WHERE email = $1", user.email)
      conn.exec("DELETE FROM playback_positions WHERE email = $1", user.email) if clear_positions
    end
  end

  # -------------------
  #  Update (channels)
  # -------------------

  def update_subscriptions(user : User)
    request = <<-SQL
      UPDATE users
      SET feed_needs_update = true, subscriptions = $1
      WHERE email = $2
      SQL

    PG_DB.exec(request, user.subscriptions, user.email)
  end

  def subscribe_channel(user : User, ucid : String)
    request = <<-SQL
      UPDATE users
      SET feed_needs_update = true,
          subscriptions = array_append(subscriptions,$1)
      WHERE email = $2
      SQL

    PG_DB.exec(request, ucid, user.email)
  end

  def unsubscribe_channel(user : User, ucid : String)
    request = <<-SQL
      UPDATE users
      SET feed_needs_update = true,
          subscriptions = array_remove(subscriptions, $1)
      WHERE email = $2
      SQL

    PG_DB.exec(request, ucid, user.email)
  end

  # -------------------
  #  Update (notifs)
  # -------------------

  def add_multiple_notifications(channel_id : String, video_ids : Array(String))
    request = <<-SQL
      UPDATE users
      SET notifications = array_cat(notifications, $1),
          feed_needs_update = true
      WHERE $2 = ANY(subscriptions)
      SQL

    PG_DB.exec(request, video_ids, channel_id)
  end

  def remove_notification(user : User, vid : String)
    request = <<-SQL
      UPDATE users
      SET notifications = array_remove(notifications, $1)
      WHERE email = $2
      SQL

    PG_DB.exec(request, vid, user.email)
  end

  def clear_notifications(user : User)
    request = <<-SQL
      UPDATE users
      SET notifications = '{}', updated = now()
      WHERE email = $1
      SQL

    PG_DB.exec(request, user.email)
  end

  # -------------------
  #  Update (misc)
  # -------------------

  def feed_needs_update(channel_id : String)
    request = <<-SQL
      UPDATE users
      SET feed_needs_update = true
      WHERE $1 = ANY(subscriptions)
      SQL

    PG_DB.exec(request, channel_id)
  end

  def preference_json(email : String) : String
    PG_DB.query_one("SELECT preferences FROM users WHERE email = $1", email, as: String)
  end

  def compare_and_set_preferences(email : String, previous : String, preferences : Preferences) : Bool
    PG_DB.exec("UPDATE users SET preferences = $1 WHERE email = $2 AND preferences = $3",
      preferences.to_json, email, previous).rows_affected == 1
  end

  # Lock and merge the latest raw account document. The caller owns only its
  # declared fields; unknown/native keys must survive typed model parsing.
  def merge_preferences(email : String, &)
    raw = ""
    PG_DB.transaction do |tx|
      conn = tx.connection
      previous = conn.query_one("SELECT preferences FROM users WHERE email = $1 FOR UPDATE", email, as: String)
      stored = JSON.parse(previous).as_h
      merged = yield conn, stored
      Preferences.remove_retired_theme_fields(merged)
      raw = merged.to_json
      conn.exec("UPDATE users SET preferences = $1 WHERE email = $2", raw, email)
    end
    raw
  end

  def update_preferences(user : User)
    request = <<-SQL
      UPDATE users
      SET preferences = $1
      WHERE email = $2
      SQL

    PG_DB.exec(request, user.preferences.to_json, user.email)
  end

  # A transactional compare-and-set also supports the legacy browser handlers
  # exercised by the SQLite fixture harness. Production uses the same bounded
  # retry and SQL condition; a competing write is merged again, never discarded.
  def merge_preferences_cas(email : String, clear_positions : Bool = false, &)
    4.times do
      raw = ""
      saved = false
      PG_DB.transaction do |tx|
        conn = tx.connection
        previous = conn.query_one("SELECT preferences FROM users WHERE email = $1", email, as: String)
        merged = yield JSON.parse(previous).as_h
        Preferences.remove_retired_theme_fields(merged)
        raw = merged.to_json
        if conn.exec("UPDATE users SET preferences = $1 WHERE email = $2 AND preferences = $3", raw, email, previous).rows_affected == 1
          conn.exec("DELETE FROM playback_positions WHERE email = $1", email) if clear_positions
          saved = true
        else
          tx.rollback
        end
      end
      return raw if saved
    end
    raise PreferenceConflict.new("Preferences changed concurrently; reload before retrying")
  end

  def update_password(user : User, pass : String)
    request = <<-SQL
      UPDATE users
      SET password = $1
      WHERE email = $2
      SQL

    PG_DB.exec(request, pass, user.email)
  end

  # -------------------
  #  Select
  # -------------------

  def select(*, email : String) : User?
    request = <<-SQL
      SELECT * FROM users
      WHERE email = $1
      SQL

    return PG_DB.query_one?(request, email, as: User)
  end

  def display_name(email : String) : String
    PG_DB.query_one?("SELECT username FROM users WHERE email = $1", email, as: String) || email
  end

  # Same as select, but can raise an exception
  def select!(*, email : String) : User
    request = <<-SQL
      SELECT * FROM users
      WHERE email = $1
      SQL

    return PG_DB.query_one(request, email, as: User)
  end

  def select(*, token : String) : User?
    request = <<-SQL
      SELECT * FROM users
      WHERE token = $1
      SQL

    return PG_DB.query_one?(request, token, as: User)
  end

  def select_notifications(user : User) : Array(String)
    request = <<-SQL
      SELECT notifications
      FROM users
      WHERE email = $1
      SQL

    return PG_DB.query_one(request, user.email, as: Array(String))
  end
end

require "./base.cr"

#
# This module contains functions related to the "playlists" table.
#
module Invidious::Database::Playlists
  extend self

  # -------------------
  #  Insert / delete
  # -------------------

  def insert(playlist : InvidiousPlaylist, conn = PG_DB)
    playlist_array = playlist.to_a

    request = <<-SQL
      INSERT INTO playlists
      VALUES (#{arg_array(playlist_array)})
      SQL

    conn.exec(request, args: playlist_array)
  end

  def insert_owned(playlist : InvidiousPlaylist)
    PG_DB.transaction do |tx|
      conn = tx.connection
      conn.query_one("SELECT email FROM users WHERE email = $1 FOR UPDATE", playlist.author, as: String)
      count = conn.query_one("SELECT count(*) FROM playlists WHERE author = $1 AND left(id, 2) = 'IV'", playlist.author, as: Int64)
      raise InfoException.new("User cannot have more than 100 playlists.") if count >= 100
      insert(playlist, conn)
    end
  end

  # deletes the given playlist and connected playlist videos
  def delete(id : String)
    PG_DB.transaction do |tx|
      conn = tx.connection
      conn.query_one?("SELECT id FROM playlists WHERE id = $1 FOR UPDATE", id, as: String)
      conn.exec("DELETE FROM playlist_videos WHERE plid = $1", id)
      conn.exec("DELETE FROM playlists WHERE id = $1", id)
    end
  end

  # A whole occurrence change is one transaction. The lock is shared with move,
  # so limits and the ordered index cannot race with another add/remove/reorder.
  def append_video(id : String, owner : String, video : PlaylistVideo, snapshot : Array(Int64)? = nil) : {Symbol, Int32}
    result = {:missing, 0}
    PG_DB.transaction do |tx|
      conn = tx.connection
      if row = conn.query_one?("SELECT author, index FROM playlists WHERE id = $1 FOR UPDATE", id, as: {String, Array(Int64)})
        author, order = row
        if author != owner
          result = {:forbidden, 0}
        elsif order.size >= CONFIG.playlist_length_limit
          result = {:full, order.size}
        else
          position = order.size
          PlaylistVideos.insert(video, conn)
          order << video.index
          conn.exec("UPDATE playlists SET index = $1, video_count = $2, updated = now() WHERE id = $3", order, order.size, id)
          snapshot.try &.concat(order)
          result = {:ok, position}
        end
      end
    end
    result
  end

  def remove_video(id : String, owner : String, entry : Int64, snapshot : Array(Int64)? = nil) : Symbol
    result = :missing
    PG_DB.transaction do |tx|
      conn = tx.connection
      if row = conn.query_one?("SELECT author, index FROM playlists WHERE id = $1 FOR UPDATE", id, as: {String, Array(Int64)})
        author, order = row
        if author != owner
          result = :forbidden
        elsif !order.includes?(entry)
          result = :conflict
        else
          conn.exec("DELETE FROM playlist_videos WHERE plid = $1 AND index = $2", id, entry)
          order.delete(entry)
          conn.exec("UPDATE playlists SET index = $1, video_count = $2, updated = now() WHERE id = $3", order, order.size, id)
          snapshot.try &.concat(order)
          result = :ok
        end
      end
    end
    result
  end

  def cover_ids(owner : String) : Hash(String, String)
    PG_DB.query_all(<<-SQL, owner, as: {String, String?}).to_h.transform_values { |id| id || "" }
      SELECT p.id, v.id FROM playlists p
      LEFT JOIN LATERAL (
        SELECT id FROM playlist_videos WHERE plid = p.id AND index = ANY(p.index)
        ORDER BY array_position(p.index, index) LIMIT 1
      ) v ON true
      WHERE p.author = $1 AND left(p.id, 2) = 'IV'
      SQL
  end

  # -------------------
  #  Update
  # -------------------

  def update(id : String, title : String, privacy, description, updated)
    request = <<-SQL
      UPDATE playlists
      SET title = $1, privacy = $2, description = $3, updated = $4
      WHERE id = $5
      SQL

    PG_DB.exec(request, title, privacy, description, updated, id)
  end

  def update_description(id : String, description)
    request = <<-SQL
      UPDATE playlists
      SET description = $1
      WHERE id = $2
      SQL

    PG_DB.exec(request, description, id)
  end

  def update_subscription_time(id : String)
    request = <<-SQL
      UPDATE playlists
      SET subscribed = now()
      WHERE id = $1
      SQL

    PG_DB.exec(request, id)
  end

  def update_video_added(id : String, index : String | Int64)
    request = <<-SQL
      UPDATE playlists
      SET index = array_append(index, $1),
          video_count = cardinality(index) + 1,
          updated = now()
      WHERE id = $2
      SQL

    PG_DB.exec(request, index, id)
  end

  def update_video_removed(id : String, index : String | Int64)
    request = <<-SQL
      UPDATE playlists
      SET index = array_remove(index, $1),
          video_count = cardinality(index) - 1,
          updated = now()
      WHERE id = $2
      SQL

    PG_DB.exec(request, index, id)
  end

  # Stable occurrence IDs, rather than video IDs or visible positions, preserve
  # duplicate videos and entries on pages the browser has not loaded.
  def move_video(id : String, owner : String, source : Int64, anchor : Int64, after : Bool, snapshot : Array(Int64)? = nil) : Symbol
    result = :missing
    PG_DB.transaction do |tx|
      conn = tx.connection
      row = conn.query_one?("SELECT author, index FROM playlists WHERE id = $1 FOR UPDATE", id, as: {String, Array(Int64)})
      if row
        author, order = row
        if author != owner
          result = :forbidden
        elsif !order.includes?(source) || !order.includes?(anchor)
          result = :conflict
        else
          unless source == anchor
            order.delete(source)
            position = order.index(anchor).not_nil!
            order.insert(after ? position + 1 : position, source)
            conn.exec("UPDATE playlists SET index = $1, updated = now() WHERE id = $2", order, id)
          end
          snapshot.try &.concat(order)
          result = :ok
        end
      end
    end
    result
  end

  # -------------------
  #  Select
  # -------------------

  def select(*, id : String) : InvidiousPlaylist?
    request = <<-SQL
      SELECT * FROM playlists
      WHERE id = $1
      SQL

    return PG_DB.query_one?(request, id, as: InvidiousPlaylist)
  end

  # Resolve a stable occurrence against one authorized, consistent snapshot.
  # Public API `index` remains an ordinal; private order is never exposed here.
  def occurrence_offset(plid : String, occurrence : Int64, video_id : String, viewer : String?) : Int32?
    PG_DB.query_one?(<<-SQL, plid, occurrence, video_id, viewer, PlaylistPrivacy::Private.to_s, as: Int32)
      SELECT array_position(p.index, $2) - 1
      FROM playlists p
      WHERE p.id = $1 AND $2 = ANY(p.index)
        AND (p.privacy <> $5 OR p.author = $4)
        AND EXISTS (
          SELECT 1 FROM playlist_videos v
          WHERE v.plid = p.id AND v.index = $2 AND v.id = $3
        )
      SQL
  end

  def select_all(*, author : String) : Array(InvidiousPlaylist)
    request = <<-SQL
      SELECT * FROM playlists
      WHERE author = $1
      SQL

    return PG_DB.query_all(request, author, as: InvidiousPlaylist)
  end

  # -------------------
  #  Select (filtered)
  # -------------------

  def select_like_iv(email : String) : Array(InvidiousPlaylist)
    request = <<-SQL
      SELECT * FROM playlists
      WHERE author = $1 AND id LIKE 'IV%'
      ORDER BY created
      SQL

    PG_DB.query_all(request, email, as: InvidiousPlaylist)
  end

  def select_not_like_iv(email : String) : Array(InvidiousPlaylist)
    request = <<-SQL
      SELECT * FROM playlists
      WHERE author = $1 AND id NOT LIKE 'IV%'
      ORDER BY created
      SQL

    PG_DB.query_all(request, email, as: InvidiousPlaylist)
  end

  def select_user_created_playlists(email : String) : Array({String, String})
    request = <<-SQL
      SELECT id,title FROM playlists
      WHERE author = $1 AND id LIKE 'IV%'
      ORDER BY title
      SQL

    PG_DB.query_all(request, email, as: {String, String})
  end

  # -------------------
  #  Misc checks
  # -------------------

  # Check if given playlist ID exists
  def exists?(id : String) : Bool
    request = <<-SQL
      SELECT id FROM playlists
      WHERE id = $1
      SQL

    return PG_DB.query_one?(request, id, as: String).nil?
  end

  # Count how many playlist a user has created.
  def count_owned_by(author : String) : Int64
    request = <<-SQL
      SELECT count(*) FROM playlists
      WHERE author = $1 AND id LIKE 'IV%'
      SQL

    return PG_DB.query_one?(request, author, as: Int64) || 0_i64
  end
end

#
# This module contains functions related to the "playlist_videos" table.
#
module Invidious::Database::PlaylistVideos
  extend self

  private alias VideoIndex = Int64 | Array(Int64)

  # -------------------
  #  Insert / Delete
  # -------------------

  def insert(video : PlaylistVideo, conn = PG_DB)
    video_array = video.to_a

    request = <<-SQL
      INSERT INTO playlist_videos
      VALUES (#{arg_array(video_array)})
      SQL

    conn.exec(request, args: video_array)
  end

  def delete(index, plid : String)
    request = <<-SQL
      DELETE FROM playlist_videos *
      WHERE index = $1 AND plid = $2
      SQL

    PG_DB.exec(request, index, plid)
  end

  def delete_by_playlist(plid : String)
    request = <<-SQL
      DELETE FROM playlist_videos *
      WHERE plid = $1
      SQL

    PG_DB.exec(request, plid)
  end

  # -------------------
  #  Select
  # -------------------

  def select(plid : String, index : VideoIndex, offset, limit = 100) : Array(PlaylistVideo)
    request = <<-SQL
      SELECT * FROM playlist_videos
      WHERE plid = $1
      ORDER BY array_position($2, index)
      LIMIT $3
      OFFSET $4
      SQL

    return PG_DB.query_all(request, plid, index, limit, offset, as: PlaylistVideo)
  end

  def select_index(plid : String, vid : String) : Int64?
    request = <<-SQL
      SELECT index FROM playlist_videos
      WHERE plid = $1 AND id = $2
      LIMIT 1
      SQL

    return PG_DB.query_one?(request, plid, vid, as: Int64)
  end

  def select_one_id(plid : String, index : VideoIndex) : String?
    request = <<-SQL
      SELECT id FROM playlist_videos
      WHERE plid = $1
      ORDER BY array_position($2, index)
      LIMIT 1
      SQL

    return PG_DB.query_one?(request, plid, index, as: String)
  end

  def select_ids(plid : String, index : VideoIndex, limit = 500) : Array(String)
    request = <<-SQL
      SELECT id FROM playlist_videos
      WHERE plid = $1
      ORDER BY array_position($2, index)
      LIMIT $3
      SQL

    return PG_DB.query_all(request, plid, index, limit, as: String)
  end
end

module Invidious::NativePlaylists
  extend self

  def valid_id?(id : String) : Bool
    id.matches?(/\A[A-Za-z0-9_-]{1,100}\z/)
  end

  def seed(id : String, explicit : String? = nil) : String
    candidate = explicit || id.lchop("RD")
    raise InfoException.new("This mix needs a valid seed video.") unless candidate.matches?(/\A[A-Za-z0-9_-]{11}\z/)
    candidate
  end

  def metadata(playlist : InvidiousPlaylist | Playlist, email : String? = nil) : Hash(String, JSON::Any)
    owned = playlist.is_a?(InvidiousPlaylist) && playlist.id.starts_with?("IV") && playlist.author == email
    JSON.parse({
      "type" => playlist.is_a?(InvidiousPlaylist) ? "invidiousPlaylist" : "playlist",
      "playlistId" => playlist.id, "title" => playlist.title,
      "videoCount" => playlist.video_count, "privacy" => playlist.privacy.to_s.downcase,
      "description" => Helpers.html_to_content(playlist.description_html),
      "playlistThumbnail" => playlist.thumbnail,
      "author" => playlist.is_a?(InvidiousPlaylist) ? playlist.display_author : playlist.author,
      "authorId" => playlist.ucid, "isOwned" => owned,
      "isSaved" => email ? Database::SavedPlaylists.exists?(email, playlist.id) : false,
      "isMix" => false,
    }.to_json).as_h
  end

  def metadata(mix : Mix, seed : String) : Hash(String, JSON::Any)
    JSON.parse({"type" => "playlist", "playlistId" => mix.id, "title" => mix.title,
                "videoCount" => -1, "privacy" => "public", "description" => "", "author" => "", "authorId" => "",
                "playlistThumbnail" => "/vi/#{seed}/mqdefault.jpg", "seedVideoId" => seed,
                "isOwned" => false, "isSaved" => false, "isMix" => true}.to_json).as_h
  end

  def resolve(id : String, email : String, explicit_seed : String? = nil) : Hash(String, JSON::Any)
    raise InfoException.new("Invalid playlist ID.") unless valid_id?(id)
    if id.starts_with?("RD")
      video = seed(id, explicit_seed)
      return metadata(fetch_mix(id, video), video)
    end
    playlist = get_playlist(id)
    if playlist.is_a?(InvidiousPlaylist)
      raise NotFoundException.new("Playlist does not exist.") if playlist.privacy.private? && playlist.author != email
      raise InfoException.new("This playlist is already in My playlists.") if playlist.author == email
    end
    metadata(playlist, email)
  end

  # Reuse the existing web card renderer without changing the page layout.
  def items(email : String) : Array(SearchPlaylist)
    Database::SavedPlaylists.list(email).map do |item|
      SearchPlaylist.new({title: item["title"].as_s, id: item["playlistId"].as_s,
                          author: "", ucid: "",
                          video_count: item["videoCount"].as_i, videos: [] of SearchPlaylistVideo,
                          thumbnail: item["playlistThumbnail"]?.try(&.as_s?), author_verified: false})
    end
  end
end

struct Invidious::User
  module Export
    extend self

    def to_invidious(user : User)
      playlists = Invidious::Database::Playlists.select_like_iv(user.email)

      return JSON.build do |json|
        json.object do
          json.field "subscriptions", user.subscriptions
          json.field "watch_history", user.watched
          json.field "preferences", user.preferences
          json.field "playback_positions" do
            json.array do
              Invidious::Database::PlaybackPositions.select_all(user.email).each do |position|
                json.object do
                  json.field "video_id", position[:video_id]
                  json.field "position", position[:position_seconds]
                  json.field "updated_at", position[:updated_at].to_unix
                end
              end
            end
          end
          json.field "playlists" do
            json.array do
              playlists.each do |playlist|
                json.object do
                  json.field "title", playlist.title
                  json.field "description", Helpers.html_to_content(playlist.description_html)
                  json.field "privacy", playlist.privacy.to_s
                  json.field "videos" do
                    json.array do
                      Invidious::Database::PlaylistVideos.select_ids(playlist.id, playlist.index, limit: CONFIG.playlist_length_limit).each do |video_id|
                        json.string video_id
                      end
                    end
                  end
                end
              end
            end
          end
        end
      end
    end
  end # module
end

module Invidious::SponsorBlock
  def self.save_channel_override(email : String, id : String, entry : ChannelOverride?) : String
    Invidious::Database::Users.merge_preferences_cas(email) do |stored|
      merge_channel_override(stored, id, entry)
    end
  end
end

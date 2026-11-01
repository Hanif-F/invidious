module Invidious::ChannelSpoilers
  def self.save_web_rule(email : String, id : String, entry : Rule?) : String
    # Keep the original row-lock boundary: simultaneous category/channel edits
    # must merge after the preceding writer has committed.
    Invidious::Database::Users.merge_preferences(email) do |_conn, stored|
      merge_web_rule(stored, id, entry)
    end
  end
end

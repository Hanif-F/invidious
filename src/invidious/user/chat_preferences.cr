module Invidious::ChatPreferences
  # CAS retries only known conflicts; each attempt merges the newest raw row.
  def self.save_account(email : String, data : Hash(String, JSON::Any)) : Preferences
    validate_patch(data)
    raw = Invidious::Database::Users.merge_preferences_cas(email) do |stored|
      merged = merge_patch(stored, data)
      proposed = Preferences.from_json(merged.to_json)
      validate_geometry(data, proposed.chat_overlay_x, proposed.chat_overlay_y,
        proposed.chat_overlay_width, proposed.chat_overlay_height)
      merged
    end
    Preferences.from_json(raw)
  end
end

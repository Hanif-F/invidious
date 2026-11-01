# The browser harness can return the actual production DTO for an unchanged
# rendered page. Record the owning preferences/context while rendering instead
# of guessing defaults from DOM controls or exposing full preferences in HTML.
module Invidious::Frontend::Desktop
  @@fixture_owner_states = {} of String => String

  def listing?(env) : Bool
    eligible = previous_def(env)
    if eligible || watch?(env)
      preferences = env.get("preferences").as(Preferences)
      blocked = BlockedChannels.ids(env)
      profile = Invidious::BrowserProfiles.render_scope(env)
      fingerprint = OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, preferences.to_json)
      owner = Misc.browse_fingerprint(preferences, history: env.request.path == "/feed/history", blocked: blocked)
      key = [fingerprint, owner, profile].to_json
      @@fixture_owner_states[key] = EnhancementState.snapshot(preferences, profile, !!env.get?("user"), blocked, HMAC_KEY).to_json
    end
    eligible
  end

  def fixture_owner_states
    @@fixture_owner_states.transform_values { |value| JSON.parse(value) }
  end
end

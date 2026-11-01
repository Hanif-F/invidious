{% skip_file if flag?(:api_only) %}

module Invidious::Routes::PreferencesRoute
  def self.detect_timezone(env)
    user = env.get?("user").try &.as(User)
    return Errors.error_json(403, "No such user") unless user
    begin
      Invidious::Helpers::Tokens.validate_request(env.params.body["csrf_token"]?, env.get("sid").as(String), env.request, HMAC_KEY, user.preferences.locale)
    rescue
      return Errors.error_json(403, "Invalid CSRF token")
    end
    zone = Invidious::History.timezone(env.params.body["timezone"]?)
    return Errors.error_json(400, "Invalid timezone") unless zone
    Invidious::Database::Users.merge_preferences_cas(user.email) do |stored|
      stored.merge({"timezone" => JSON::Any.new(zone)})
    end
    env.response.status_code = 204
  end

  def self.show(env)
    if section = env.params.query["section"]?
      return show_section(env, section)
    end
    return runtime(env) if env.params.query["format"]? == "runtime"
    # Fragments never reach the server. The default category includes ordinary
    # links for recognized old anchors; the browser can replace that entry with
    # its canonical destination without changing legacy POST/native contracts.
    env.set "settings_legacy_entry", true
    show_section(env, "appearance")
  end

  def self.runtime_preferences(env) : Preferences
    user = env.get?("user").try(&.as(User))
    raw = user ? Invidious::Database::Users.preference_json(user.email) : guest_fields(env).to_json
    Preferences.from_json(raw)
  end

  def self.runtime(env)
    Authentication.no_store(env)
    env.response.content_type = "application/json"
    user = env.get?("user").try(&.as(User))
    preferences = runtime_preferences(env)
    blocked = user ? Invidious::Database::BlockedChannels.ids(user.email) : [] of String
    Invidious::Frontend::EnhancementState.snapshot(preferences, Invidious::BrowserProfiles.render_scope(env), !!user, blocked, HMAC_KEY).to_json
  rescue DB::NoResultsError
    env.response.status_code = 403
    {error: "This account is no longer available. Reload to sign in again."}.to_json
  rescue
    env.response.status_code = 503
    {error: "Enhancement settings could not be checked. Try again."}.to_json
  end

  def self.update(env)
    if env.params.query["format"]? == "runtime"
      Authentication.no_store(env)
      env.response.headers["Allow"] = "GET"
      return Errors.error_json(405, "Use GET to check enhancement settings.")
    end
    if env.get?("user") && !Authentication.valid_session_csrf?(env)
      if section = env.params.body["section"]?
        return section_failure(env, 403, "Your session could not be verified. Reload this page before saving.", section)
      end
      return Errors.error_template(403, "Invalid CSRF token")
    end
    if section = env.params.body["section"]?
      return update_chat(env) if section == "chat"
      return update_section(env, section)
    end
    locale = env.get("preferences").as(Preferences).locale
    referer = get_referer(env)
    if zone = env.params.body["timezone"]?
      unless zone.empty? || Invidious::History.timezone(zone)
        return Errors.error_template(400, "Invalid timezone")
      end
    end

    video_loop = env.params.body["video_loop"]?.try &.as(String)
    video_loop ||= "off"
    video_loop = video_loop == "on"

    annotations = env.params.body["annotations"]?.try &.as(String)
    annotations ||= "off"
    annotations = annotations == "on"

    annotations_subscribed = env.params.body["annotations_subscribed"]?.try &.as(String)
    annotations_subscribed ||= "off"
    annotations_subscribed = annotations_subscribed == "on"

    preload = env.params.body["preload"]?.try &.as(String)
    preload ||= "off"
    preload = preload == "on"

    autoplay = env.params.body["autoplay"]?.try &.as(String)
    autoplay ||= "off"
    autoplay = autoplay == "on"

    continue = env.params.body["continue"]?.try &.as(String)
    continue ||= "off"
    continue = continue == "on"

    continue_autoplay = env.params.body["continue_autoplay"]?.try &.as(String)
    continue_autoplay ||= "off"
    continue_autoplay = continue_autoplay == "on"

    listen = env.params.body["listen"]?.try &.as(String)
    listen ||= "off"
    listen = listen == "on"

    local = env.params.body["local"]?.try &.as(String)
    local ||= "off"
    local = local == "on"

    watch_history = env.params.body["watch_history"]?.try &.as(String)
    watch_history ||= "off"
    watch_history = watch_history == "on"

    speed = env.params.body["speed"]?.try &.as(String).to_f32?
    speed ||= CONFIG.default_user_preferences.speed

    player_style = env.params.body["player_style"]?.try &.as(String)
    player_style ||= CONFIG.default_user_preferences.player_style

    quality = env.params.body["quality"]?.try &.as(String)
    quality ||= CONFIG.default_user_preferences.quality

    quality_dash = env.params.body["quality_dash"]?.try &.as(String)
    quality_dash ||= CONFIG.default_user_preferences.quality_dash

    extend_desc = env.params.body["extend_desc"]?.try &.as(String)
    extend_desc ||= "off"
    extend_desc = extend_desc == "on"

    vr_mode = env.params.body["vr_mode"]?.try &.as(String)
    vr_mode ||= "off"
    vr_mode = vr_mode == "on"

    save_player_pos = env.params.body["save_player_pos"]?.try &.as(String)
    save_player_pos ||= "off"
    save_player_pos = save_player_pos == "on"

    show_nick = env.params.body["show_nick"]?.try &.as(String)
    show_nick ||= "off"
    show_nick = show_nick == "on"

    comments = [] of String
    2.times do |i|
      comments << (env.params.body["comments[#{i}]"]?.try &.as(String) || CONFIG.default_user_preferences.comments[i])
    end

    captions = [] of String
    3.times do |i|
      captions << (env.params.body["captions[#{i}]"]?.try &.as(String) || CONFIG.default_user_preferences.captions[i])
    end

    related_videos = env.params.body["related_videos"]?.try &.as(String)
    related_videos ||= "off"
    related_videos = related_videos == "on"

    default_home = env.params.body["default_home"]?.try &.as(String) || CONFIG.default_user_preferences.default_home

    feed_menu = [] of String
    4.times do |index|
      option = env.params.body["feed_menu[#{index}]"]?.try &.as(String) || ""
      if !option.empty?
        feed_menu << option
      end
    end

    automatic_instance_redirect = env.params.body["automatic_instance_redirect"]?.try &.as(String)
    automatic_instance_redirect ||= "off"
    automatic_instance_redirect = automatic_instance_redirect == "on"

    region = env.params.body["region"]?.try &.as(String)

    locale = env.params.body["locale"]?.try &.as(String)
    locale ||= CONFIG.default_user_preferences.locale

    dark_mode = env.params.body["dark_mode"]?.try &.as(String)
    dark_mode ||= CONFIG.default_user_preferences.dark_mode

    previous = env.get("preferences").as(Preferences)
    seek_seconds = env.params.body["seek_seconds"]?.try { |value| Invidious::Videos::SeekPreferences.normalize(value.to_i64? || 10) } || previous.seek_seconds
    video_codec = Preferences::VideoCodec.normalize(env.params.body["video_codec"]? || previous.video_codec)
    preferred_audio = Invidious::Videos::AudioPreferences.normalize(env.params.body["preferred_audio"]? || previous.preferred_audio)
    ui_density = env.params.body["ui_density"]? || env.get("preferences").as(Preferences).ui_density
    ui_density = Preferences::UIDensity.normalize(ui_density)

    thin_mode = env.params.body["thin_mode"]?.try &.as(String)
    thin_mode ||= "off"
    thin_mode = thin_mode == "on"

    max_results = env.params.body["max_results"]?.try &.as(String).to_i?
    max_results ||= CONFIG.default_user_preferences.max_results

    sort = env.params.body["sort"]?.try &.as(String)
    sort ||= CONFIG.default_user_preferences.sort

    latest_only = env.params.body["latest_only"]?.try &.as(String)
    latest_only ||= "off"
    latest_only = latest_only == "on"

    unseen_only = env.params.body["unseen_only"]?.try &.as(String)
    unseen_only ||= "off"
    unseen_only = unseen_only == "on"

    notifications_only = env.params.body["notifications_only"]?.try &.as(String)
    notifications_only ||= "off"
    notifications_only = notifications_only == "on"

    default_playlist = env.params.body["default_playlist"]?.try &.as(String)

    search_privacy = env.params.body["search_privacy"]?.try &.as(String)
    search_privacy ||= "off"
    search_privacy = search_privacy == "on"

    # Convert to JSON and back again to take advantage of converters used for compatibility
    preferences = Preferences.from_json({
      annotations:                    annotations,
      annotations_subscribed:         annotations_subscribed,
      preload:                        preload,
      autoplay:                       autoplay,
      captions:                       captions,
      comments:                       comments,
      continue:                       continue,
      continue_autoplay:              continue_autoplay,
      dark_mode:                      dark_mode,
      latest_only:                    latest_only,
      listen:                         listen,
      local:                          local,
      watch_history:                  watch_history,
      locale:                         locale,
      max_results:                    max_results,
      notifications_only:             notifications_only,
      player_style:                   player_style,
      quality:                        quality,
      quality_dash:                   quality_dash,
      video_codec:                    video_codec,
      preferred_audio:                preferred_audio,
      default_home:                   default_home,
      feed_menu:                      feed_menu,
      automatic_instance_redirect:    automatic_instance_redirect,
      region:                         region,
      timezone:                       Invidious::History.timezone(env.params.body["timezone"]? || previous.timezone),
      show_member_videos:             env.params.body["show_member_videos"]? == "on",
      show_original_title:            env.params.body["show_original_title_present"]? == "1" ? env.params.body["show_original_title"]? == "on" : previous.show_original_title,
      related_videos:                 related_videos,
      sort:                           sort,
      speed:                          speed,
      seek_seconds:                   seek_seconds,
      thin_mode:                      thin_mode,
      ui_density:                     ui_density,
      unseen_only:                    unseen_only,
      video_loop:                     video_loop,
      extend_desc:                    extend_desc,
      vr_mode:                        vr_mode,
      show_nick:                      show_nick,
      save_player_pos:                save_player_pos,
      default_playlist:               default_playlist,
      search_privacy:                 search_privacy,
      sponsorblock_channel_overrides: previous.sponsorblock_channel_overrides,
      channel_spoiler_settings:       previous.channel_spoiler_settings,
      sponsorblock_enabled:           env.params.body["sponsorblock_enabled"]? == "on",
      sponsorblock_modes:             Invidious::SponsorBlock::CATEGORIES.to_h { |category, _| {category, env.params.body["sponsorblock_mode_#{category}"]? || previous.sponsorblock_modes[category]} },
      sponsorblock_colors:            Invidious::SponsorBlock::CATEGORIES.to_h { |category, _| {category, env.params.body["sponsorblock_color_#{category}"]? || previous.sponsorblock_colors[category]} },
      dearrow_enabled:                env.params.body["dearrow_enabled"]? == "on",
      ai_blocklist_feeds:             env.params.body["ai_blocklist_feeds"]? == "on",
      ai_blocklist_search:            env.params.body["ai_blocklist_search"]? == "on",
      ai_blocklist_recommendations:   env.params.body["ai_blocklist_recommendations"]? == "on",
      ai_warnlist_feeds:              env.params.body["ai_warnlist_feeds"]? == "on",
      ai_warnlist_search:             env.params.body["ai_warnlist_search"]? == "on",
      ai_warnlist_recommendations:    env.params.body["ai_warnlist_recommendations"]? == "on",
      ai_blocklist_action:            env.params.body["ai_blocklist_action"]? || previous.ai_blocklist_action,
      ai_warnlist_action:             env.params.body["ai_warnlist_action"]? || previous.ai_warnlist_action,
      ai_blocklist_other_pages:       env.params.body["ai_blocklist_other_pages"]? == "on",
      ai_warnlist_other_pages:        env.params.body["ai_warnlist_other_pages"]? == "on",
      dearrow_show_original:          env.params.body["dearrow_show_original"]? == "on",
      chat_show_timestamps:           previous.chat_show_timestamps,
      chat_font_scale:                previous.chat_font_scale,
      chat_width_px:                  previous.chat_width_px,
      chat_overlay_mode:              previous.chat_overlay_mode,
      chat_overlay_opacity:           previous.chat_overlay_opacity,
      chat_overlay_x:                 previous.chat_overlay_x,
      chat_overlay_y:                 previous.chat_overlay_y,
      chat_overlay_width:             previous.chat_overlay_width,
      chat_overlay_height:            previous.chat_overlay_height,
      chat_user_blacklist:            previous.chat_user_blacklist,
      chat_word_blacklist:            previous.chat_word_blacklist,
    }.to_json)

    # Only the versioned form may pause filtering. Older forms and omitted
    # actions must never reset saved AI selections.
    ai_filter_form = env.params.body["ai_filter_form_version"]? == "2"
    preferences.ai_filter_enabled = ai_filter_form ? env.params.body["ai_filter_enabled"]? == "on" : previous.ai_filter_enabled
    {% for kind in {"blocklist", "warnlist"} %}
      {% for surface in {"feeds", "search", "recommendations", "other_pages"} %}
        preferences.ai_{{ kind.id }}_{{ surface.id }}_action = ai_filter_form ?
          (env.params.body["ai_{{ kind.id }}_{{ surface.id }}_action"]? || previous.ai_{{ kind.id }}_{{ surface.id }}_action) :
          previous.ai_{{ kind.id }}_{{ surface.id }}_action
      {% end %}
    {% end %}

    raw = if user = env.get?("user").try(&.as(User))
            Invidious::Database::Users.merge_preferences_cas(user.email, clear_positions: !preferences.save_player_pos) do |stored|
              Invidious::WebPreferences.merge_legacy(stored, preferences, env.params.body)
            end
          else
            saved = Invidious::WebPreferences.merge_legacy(guest_fields(env), preferences, env.params.body).to_json
            cookie = Invidious::User::Cookies.prefs_json(Authentication.cookie_domain(env), saved)
            return Errors.error_template(400, "These browser settings exceed the cookie limit.") if cookie.to_set_cookie_header.bytesize > 4096
            env.response.cookies["PREFS"] = cookie
            saved
          end
    preferences = Preferences.from_json(raw)
    env.set "preferences", preferences

    if env.params.query["redirect"]? == "false"
      env.response.content_type = "application/json"
      env.response.headers["Cache-Control"] = "private, no-store"
      return {preferences: preferences, fingerprint: OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, preferences.to_json)}.to_json
    end
    env.redirect referer
  end

  private def self.guest_fields(env) : Hash(String, JSON::Any)
    if cookie = env.request.cookies["PREFS"]?
      begin
        return JSON.parse(URI.decode_www_form(cookie.value)).as_h
      rescue
        # Invalid legacy cookie data already renders as defaults in BeforeAll.
      end
    end
    {} of String => JSON::Any
  end

  def self.show_section(env, section : String)
    Authentication.no_store(env)
    return show_chat(env) if section == "chat"
    begin
      Invidious::WebPreferences.fields(section)
    rescue
      return section_failure(env, 400, "Unknown settings category", nil)
    end
    if section == "library" && !env.get?("user")
      return section_failure(env, 403, "Sign in to manage library settings", nil)
    end
    raw = if user = env.get?("user").try(&.as(User))
            Invidious::Database::Users.preference_json(user.email)
          else
            guest_fields(env).to_json
          end
    canonical_preferences = Preferences.from_json(raw)
    canonical = JSON.parse(canonical_preferences.to_json).as_h
    values = Invidious::WebPreferences.values(section, canonical)
    env.set "settings_section", section
    env.set "settings_values", values.to_json
    if env.params.query["format"]? == "json"
      env.response.content_type = "application/json"
      # Additive read-back metadata also lets a retained full-form caller verify
      # its existing POST receipt without resurrecting the retired HTML editor.
      return {section: section, values: values, profile: Invidious::BrowserProfiles.render_scope(env),
              fingerprint: OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, canonical_preferences.to_json),
              browseFingerprint: Invidious::Frontend::Misc.browse_fingerprint(canonical_preferences)}.to_json
    end
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale
    templated "overhaul/settings", "overhaul/shell"
  end

  private def self.show_chat(env)
    Authentication.no_store(env)
    preferences = env.get("preferences").as(Preferences)
    locale = preferences.locale
    templated "overhaul/chat_settings", "overhaul/shell"
  end

  private def self.update_chat(env)
    Authentication.no_store(env)
    user = env.get?("user").try(&.as(User))
    return Errors.error_template(403, "Sign in to save chat settings without JavaScript") unless user
    unless env.params.body["browser_profile"]? == Invidious::BrowserProfiles.render_scope(env)
      return Errors.error_template(409, "Your signed-in profile changed. Reload before saving these settings.")
    end
    draft = Preferences.from_json(user.preferences.to_json)
    draft.chat_show_timestamps = env.params.body["chat_show_timestamps"]? == "on"
    draft.chat_user_blacklist = env.params.body["chat_user_blacklist"]? || ""
    draft.chat_word_blacklist = env.params.body["chat_word_blacklist"]? || ""
    data = {"chat_show_timestamps" => JSON::Any.new(draft.chat_show_timestamps),
            "chat_user_blacklist"  => JSON::Any.new(draft.chat_user_blacklist),
            "chat_word_blacklist"  => JSON::Any.new(draft.chat_word_blacklist)}
    begin
      marker = env.params.body["chat_show_timestamps"]?
      raise ArgumentError.new("Invalid chat settings") if marker && !{"on", "off"}.includes?(marker)
      user.preferences = Invidious::ChatPreferences.save_account(user.email, data)
    rescue ArgumentError
      env.response.status_code = 400
      env.set "preferences", draft
      env.set "chat_settings_error", I18n.translate(draft.locale, "settings_save_error")
      return show_chat(env)
    rescue Invidious::Database::Users::PreferenceConflict
      env.response.status_code = 409
      env.set "preferences", draft
      env.set "chat_settings_error", I18n.translate(draft.locale, "settings_save_unconfirmed")
      return show_chat(env)
    end
    env.redirect "/preferences?section=chat&saved=1"
  end

  private def self.section_failure(env, status : Int32, message : String, section : String?, field : String? = nil)
    Authentication.no_store(env)
    env.response.status_code = status
    if env.params.query["redirect"]? == "false" || env.params.query["format"]? == "json"
      env.response.content_type = "application/json"
      return {error: message, field: field}.to_json
    end
    if section && Invidious::WebPreferences::SECTIONS.has_key?(section)
      env.set "settings_draft", env.params.body.to_s
      env.set "settings_error", message
      env.set "settings_section", section
      preferences = env.get("preferences").as(Preferences)
      locale = preferences.locale
      env.set "settings_values", Invidious::WebPreferences.values(section, JSON.parse(preferences.to_json).as_h).to_json
      return templated "overhaul/settings", "overhaul/shell"
    end
    Errors.error_template(status, message)
  end

  private def self.update_section(env, section : String)
    Authentication.no_store(env)
    begin
      Invidious::WebPreferences.fields(section)
    rescue
      return section_failure(env, 400, "Unknown settings category", nil)
    end
    if env.params.body["browser_profile"]? != Invidious::BrowserProfiles.render_scope(env)
      return section_failure(env, 409, "Your signed-in profile changed. Reload before saving these settings.", section)
    end
    if section == "library" && !env.get?("user")
      return section_failure(env, 403, "Sign in to manage library settings", nil)
    end
    begin
      raw = if user = env.get?("user").try(&.as(User))
              Invidious::WebPreferences.save_account(user.email, section, env.params.body, I18n::LOCALES_LIST.keys)
            else
              saved = Invidious::WebPreferences.apply(section, env.params.body, guest_fields(env), I18n::LOCALES_LIST.keys).to_json
              cookie = Invidious::User::Cookies.prefs_json(Authentication.cookie_domain(env), saved)
              if cookie.to_set_cookie_header.bytesize > 4096
                return section_failure(env, 400, "These browser settings exceed the cookie limit. Sign in or reduce the saved data before retrying.", section)
              end
              env.response.cookies["PREFS"] = cookie
              saved
            end
      preferences = Preferences.from_json(raw)
      canonical = JSON.parse(preferences.to_json).as_h
      env.set "preferences", preferences
      if env.params.query["redirect"]? == "false"
        env.response.content_type = "application/json"
        return {preferences: preferences, fingerprint: OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, preferences.to_json), section: section, values: Invidious::WebPreferences.values(section, canonical), profile: Invidious::BrowserProfiles.render_scope(env)}.to_json
      end
      env.redirect "/preferences?section=#{section}&saved=1", 303
    rescue ex : Invidious::WebPreferences::InvalidField
      section_failure(env, 400, "Please check #{Invidious::Frontend::Settings.label(env.get("preferences").as(Preferences).locale, ex.field)}.", section, ex.field)
    rescue ex : DB::NoResultsError
      section_failure(env, 403, "This account is no longer available. Sign in again before saving.", section)
    rescue
      section_failure(env, 503, "Settings could not be saved. Your draft is still here.", section)
    end
  end

  private def self.next_color_mode(mode : String) : String
    case mode
    when ""      then "light"
    when "light" then "dark"
    else              ""
    end
  end

  def self.toggle_theme(env)
    if env.get?("user") && !Authentication.valid_session_csrf?(env)
      return Errors.error_template(403, "Invalid CSRF token")
    end
    locale = env.get("preferences").as(Preferences).locale
    referer = get_referer(env, unroll: false)

    redirect = env.params.query["redirect"]?
    redirect ||= "true"
    redirect = redirect == "true"

    requested = env.params.query["mode"]?
    change = ->(stored : Hash(String, JSON::Any)) {
      current = Preferences.from_json(stored.to_json).dark_mode
      mode = requested && {"", "light", "dark"}.includes?(requested) ? requested : next_color_mode(current)
      merged = stored.merge({"dark_mode" => JSON::Any.new(mode)})
      Preferences.remove_retired_theme_fields(merged)
      merged
    }
    if user = env.get?("user").try(&.as(User))
      Invidious::Database::Users.merge_preferences_cas(user.email) { |stored| change.call(stored) }
    else
      cookie = Invidious::User::Cookies.prefs_json(Authentication.cookie_domain(env), change.call(guest_fields(env)).to_json)
      return Errors.error_json(400, "These browser settings exceed the cookie limit.") if cookie.to_set_cookie_header.bytesize > 4096
      env.response.cookies["PREFS"] = cookie
    end

    if redirect
      env.redirect referer
    else
      env.response.content_type = "application/json"
      "{}"
    end
  end

  def self.data_control(env, error : String? = nil)
    Authentication.no_store(env)
    env.response.headers["Referrer-Policy"] = "no-referrer"
    source = Frontend::DataControl.source(env.params.query["source"]?)
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    referer = get_referer(env)

    if !user
      return env.redirect referer
    end

    user = user.as(User)

    templated "user/data_control"
  end

  def self.update_data_control(env)
    Authentication.no_store(env)
    env.response.headers["Referrer-Policy"] = "no-referrer"
    locale = env.get("preferences").as(Preferences).locale

    user = env.get? "user"
    referer = get_referer(env)

    if user
      user = user.as(User)

      # TODO: Find a way to prevent browser timeout

      csrf_valid = Authentication.valid_session_csrf?(env, env.request.headers["X-CSRF-Token"]?)
      HTTP::FormData.parse(env.request) do |part|
        unless csrf_valid
          # The form emits CSRF first so no file is processed before authorization.
          return Errors.error_template(403, "Invalid CSRF token") unless part.name == "csrf_token"
          csrf_valid = Authentication.valid_session_csrf?(env, part.body.gets_to_end)
          return Errors.error_template(403, "Invalid CSRF token") unless csrf_valid
          next
        end
        next if part.name == "csrf_token"
        body = part.body.gets_to_end
        type = part.headers["Content-Type"]

        next if body.empty?

        # TODO: Unify into single import based on content-type
        case part.name
        when "import_invidious"
          Invidious::User::Import.from_invidious(user, body)
        when "import_youtube"
          filename = part.filename || ""
          success = Invidious::User::Import.from_youtube(user, body, filename, type)

          if !success
            env.response.status_code = 415
            return data_control(env, "Invalid subscription file uploaded")
          end
        when "import_youtube_pl"
          filename = part.filename || ""
          success = Invidious::User::Import.from_youtube_pl(user, body, filename, type)

          if !success
            env.response.status_code = 415
            return data_control(env, "Invalid playlist file uploaded")
          end
        when "import_youtube_wh"
          filename = part.filename || ""
          success = Invidious::User::Import.from_youtube_wh(user, body, filename, type)

          if !success
            env.response.status_code = 415
            return data_control(env, "Invalid watch history file uploaded")
          end
        when "import_freetube"
          Invidious::User::Import.from_freetube(user, body)
        when "import_newpipe_subscriptions"
          Invidious::User::Import.from_newpipe_subs(user, body)
        when "import_newpipe"
          success = Invidious::User::Import.from_newpipe(user, body)

          if !success
            env.response.status_code = 415
            return data_control(env, "Unsupported or oversized NewPipe archive.")
          end
        end
      end
    end

    env.redirect referer
  rescue ex
    # An upload can contain private data, and earlier sections can already be
    # committed. Keep the source form and status; never echo parser input or
    # generate a public issue report containing the uploaded contents.
    LOGGER.error("Data import failed (#{ex.class})")
    env.response.status_code = 500
    data_control(env, "Import could not be completed. Check your imported data before trying again.")
  end
end

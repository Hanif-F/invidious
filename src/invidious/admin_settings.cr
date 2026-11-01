# Only this small manifest may be changed by the instance settings form. Never
# serialize CONFIG: it includes environment-derived credentials and other keys.
module Invidious::AdminSettings
  extend self
  BOOLEANS = %w(popular_enabled captcha_enabled login_enabled login_required registration_enabled statistics_enabled)
  ACCESS   = %w(captcha_enabled login_enabled login_required registration_enabled)
  ROOT     = BOOLEANS + %w(modified_source_code_url)
  DEFAULTS = %w(admin_default_home admin_feed_menu)
  @@mutex = Mutex.new

  class Unavailable < Exception; end

  class Stale < Exception; end

  class Invalid < Exception; end

  def path : String
    configured = ENV["INVIDIOUS_CONFIG_FILE"]? || "config/config.yml"
    return configured unless File.exists?(configured)
    {% if compare_versions(Crystal::VERSION, "1.22.0-dev") >= 0 %}
      File.realpath(configured)
    {% else %}
      File.real_path(configured)
    {% end %}
  end

  private def writable?(config_path : String) : Bool
    {% if compare_versions(Crystal::VERSION, "1.22.0-dev") >= 0 %}
      File::Info.writable?(config_path)
    {% else %}
      File.writable?(config_path)
    {% end %}
  end

  def managed?(field : String) : Bool
    ENV.has_key?("INVIDIOUS_CONFIG") || ENV.has_key?("INVIDIOUS_#{DEFAULTS.includes?(field) ? "DEFAULT_USER_PREFERENCES" : field.upcase}")
  end

  def current : Hash(String, JSON::Any)
    JSON.parse({
      popular_enabled: CONFIG.popular_enabled, captcha_enabled: CONFIG.captcha_enabled,
      login_enabled: CONFIG.login_enabled, login_required: CONFIG.login_required,
      registration_enabled: CONFIG.registration_enabled, statistics_enabled: CONFIG.statistics_enabled,
      modified_source_code_url: CONFIG.modified_source_code_url,
      admin_default_home: CONFIG.default_user_preferences.default_home || "",
      admin_feed_menu: CONFIG.default_user_preferences.feed_menu,
    }.to_json).as_h
  end

  def document(config_path : String = path) : YAML::Any
    raise Unavailable.new("Instance configuration is supplied by the deployment environment. Edit it there.") if ENV.has_key?("INVIDIOUS_CONFIG")
    YAML.parse(File.read(config_path))
  rescue ex : Unavailable
    raise ex
  rescue
    raise Unavailable.new("The configured YAML could not be read. Check the instance configuration before saving.")
  end

  def revision(doc : YAML::Any) : String
    root = doc.as_h
    defaults = root[YAML::Any.new("default_user_preferences")]?.try(&.as_h) || {} of YAML::Any => YAML::Any
    disk = ROOT.to_h { |key| {key, root[YAML::Any.new(key)]?.try(&.to_json)} }
    %w(default_home feed_menu).each { |key| disk["default_user_preferences.#{key}"] = defaults[YAML::Any.new(key)]?.try(&.to_json) }
    OpenSSL::HMAC.hexdigest(:sha256, HMAC_KEY, {current, disk}.to_json)
  end

  def configured(doc : YAML::Any) : Hash(String, JSON::Any)
    values = current
    root = doc.as_h
    ROOT.each do |key|
      next if managed?(key)
      if entry = root[YAML::Any.new(key)]?
        values[key] = BOOLEANS.includes?(key) ? JSON::Any.new(entry.as_bool) : JSON::Any.new(entry.raw.nil? ? nil : entry.as_s)
      end
    end
    unless managed?("admin_default_home")
      if defaults = root[YAML::Any.new("default_user_preferences")]?
        fields = defaults.as_h
        if home = fields[YAML::Any.new("default_home")]?
          values["admin_default_home"] = JSON::Any.new(home.raw.nil? ? "" : home.as_s)
        end
        if menu = fields[YAML::Any.new("feed_menu")]?
          values["admin_feed_menu"] = JSON::Any.new(menu.as_a.map { |entry| JSON::Any.new(entry.as_s) })
        end
      end
    end
    values
  end

  def parse(form : URI::Params, previous : Hash(String, JSON::Any) = current) : Hash(String, JSON::Any)
    values = previous.dup
    BOOLEANS.each do |key|
      next if managed?(key)
      raw = form[key]?
      raise Invalid.new("Choose a valid value for #{key}.") unless raw.nil? || {"on", "off"}.includes?(raw)
      values[key] = JSON::Any.new(raw == "on")
    end
    # Requiring accounts must always leave a working sign-in entry point.
    if values["login_required"].as_bool
      raise Invalid.new("Sign-in is disabled by the deployment environment. Change that override before requiring accounts.") if managed?("login_enabled") && !values["login_enabled"].as_bool
      values["login_enabled"] = JSON::Any.new(true)
    end
    if !managed?("modified_source_code_url") && form.has_key?("modified_source_code_url")
      source = form["modified_source_code_url"]?.try(&.strip).presence
      if source
        uri = URI.parse(source)
        raise Invalid.new("Enter an absolute HTTP or HTTPS source-code URL.") unless source.bytesize <= 2048 && {"http", "https"}.includes?(uri.scheme) && !uri.host.to_s.empty? && uri.user.nil? && uri.password.nil?
      end
      values["modified_source_code_url"] = JSON::Any.new(source)
    end
    unless managed?("admin_default_home")
      home = form["admin_default_home"]? || values["admin_default_home"].as_s
      raise Invalid.new("Choose a valid default homepage.") unless Invidious::NativePreferences::HOMES.includes?(home)
      values["admin_default_home"] = JSON::Any.new(home)
      menu = (0...4).map { |index| form["admin_feed_menu[#{index}]"]? || values["admin_feed_menu"].as_a[index]?.try(&.as_s) || "" }
      raise Invalid.new("Choose valid default feed destinations.") unless menu.all? { |value| Invidious::NativePreferences::HOMES.includes?(value) }
      values["admin_feed_menu"] = JSON::Any.new(menu.reject(&.empty?).map { |value| JSON::Any.new(value) })
    end
    if ACCESS.any? { |key| values[key] != previous[key] } && form["confirm_access"]? != "on"
      raise Invalid.new("Confirm applying the sign-in, registration or CAPTCHA changes to this instance.")
    end
    values
  rescue ex : Invalid
    raise ex
  rescue
    raise Invalid.new("Check the instance settings and try again.")
  end

  def merge(doc : YAML::Any, values : Hash(String, JSON::Any)) : YAML::Any
    root = doc.as_h
    ROOT.each { |key| root[YAML::Any.new(key)] = YAML.parse(values[key].to_json) unless managed?(key) }
    unless managed?("admin_default_home")
      key = YAML::Any.new("default_user_preferences")
      defaults = root[key]?.try(&.as_h) || {} of YAML::Any => YAML::Any
      defaults[YAML::Any.new("default_home")] = YAML.parse(values["admin_default_home"].to_json)
      defaults[YAML::Any.new("feed_menu")] = YAML.parse(values["admin_feed_menu"].to_json)
      root[key] = YAML::Any.new(defaults)
    end
    YAML::Any.new(root)
  end

  def save(form : URI::Params)
    @@mutex.synchronize do
      config_path = path
      # A separate advisory lock survives atomic replacement of the YAML inode.
      # It coordinates app processes sharing this same configuration file.
      raise Unavailable.new("The configured YAML or its directory is not writable. Your draft is still here.") unless File.file?(config_path) && writable?(config_path) && writable?(File.dirname(config_path))
      File.open("#{config_path}.settings.lock", "a", perm: 0o600) do |lock|
        lock.flock_exclusive do
          doc = document(config_path)
          raise Stale.new("Instance settings changed. Reload the saved settings before applying this draft.") unless form["revision"]? == revision(doc)
          values = parse(form, configured(doc))
          updated = merge(doc, values)
          temporary = File.tempfile(prefix: "invidious-settings-", suffix: ".tmp", dir: File.dirname(config_path))
          begin
            temporary << updated.to_yaml
            temporary.flush
            File.chmod(temporary.path, File.info(config_path).permissions)
            temporary.fsync
            temporary.close
            File.rename(temporary.path, config_path)
          ensure
            temporary.close unless temporary.closed?
            File.delete(temporary.path) if File.exists?(temporary.path)
          end
          {% for field in %w(popular_enabled captcha_enabled login_enabled login_required registration_enabled statistics_enabled) %}
            CONFIG.{{field.id}} = values[{{field}}].as_bool
          {% end %}
          CONFIG.modified_source_code_url = values["modified_source_code_url"].as_s?
          unless managed?("admin_default_home")
            defaults = CONFIG.default_user_preferences
            defaults.default_home = values["admin_default_home"].as_s
            defaults.feed_menu = values["admin_feed_menu"].as_a.map(&.as_s)
            CONFIG.default_user_preferences = defaults
          end
        end
      end
    end
  rescue ex : Invalid | Stale | Unavailable
    raise ex
  rescue ex
    raise Unavailable.new("The instance configuration could not be saved. Your draft is still here. Check the configured YAML and write permissions.", cause: ex)
  end
end

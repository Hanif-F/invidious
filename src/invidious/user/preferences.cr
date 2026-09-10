struct Preferences
  include JSON::Serializable
  include YAML::Serializable

  property annotations : Bool = CONFIG.default_user_preferences.annotations
  property annotations_subscribed : Bool = CONFIG.default_user_preferences.annotations_subscribed
  property preload : Bool = CONFIG.default_user_preferences.preload
  property autoplay : Bool = CONFIG.default_user_preferences.autoplay
  property automatic_instance_redirect : Bool = CONFIG.default_user_preferences.automatic_instance_redirect

  @[JSON::Field(converter: Preferences::StringToArray)]
  @[YAML::Field(converter: Preferences::StringToArray)]
  property captions : Array(String) = CONFIG.default_user_preferences.captions

  @[JSON::Field(converter: Preferences::StringToArray)]
  @[YAML::Field(converter: Preferences::StringToArray)]
  property comments : Array(String) = CONFIG.default_user_preferences.comments
  property continue : Bool = CONFIG.default_user_preferences.continue
  property continue_autoplay : Bool = CONFIG.default_user_preferences.continue_autoplay

  @[JSON::Field(converter: Preferences::BoolToString)]
  @[YAML::Field(converter: Preferences::BoolToString)]
  property dark_mode : String = CONFIG.default_user_preferences.dark_mode
  @[JSON::Field(converter: Preferences::Theme)]
  @[YAML::Field(converter: Preferences::Theme)]
  property theme : String = Invidious::Themes.normalize(CONFIG.default_user_preferences.theme)
  property theme_random : Bool = CONFIG.default_user_preferences.theme_random
  @[JSON::Field(converter: Preferences::ThemeInterval)]
  @[YAML::Field(converter: Preferences::ThemeInterval)]
  property theme_random_interval_hours : Int32 = CONFIG.default_user_preferences.theme_random_interval_hours
  @[JSON::Field(converter: Preferences::ThemeDeadline)]
  @[YAML::Field(converter: Preferences::ThemeDeadline)]
  property theme_random_next_at : Int64? = nil
  property latest_only : Bool = CONFIG.default_user_preferences.latest_only
  property listen : Bool = CONFIG.default_user_preferences.listen
  property local : Bool = CONFIG.default_user_preferences.local
  property watch_history : Bool = CONFIG.default_user_preferences.watch_history
  property vr_mode : Bool = CONFIG.default_user_preferences.vr_mode
  property show_nick : Bool = CONFIG.default_user_preferences.show_nick

  @[JSON::Field(converter: Preferences::ProcessString)]
  property locale : String = CONFIG.default_user_preferences.locale
  property region : String? = CONFIG.default_user_preferences.region

  @[JSON::Field(converter: Preferences::ClampInt)]
  property max_results : Int32 = CONFIG.default_user_preferences.max_results
  property notifications_only : Bool = CONFIG.default_user_preferences.notifications_only

  @[JSON::Field(converter: Preferences::ProcessString)]
  property player_style : String = CONFIG.default_user_preferences.player_style

  @[JSON::Field(converter: Preferences::ProcessString)]
  property quality : String = CONFIG.default_user_preferences.quality
  @[JSON::Field(converter: Preferences::ProcessString)]
  property quality_dash : String = CONFIG.default_user_preferences.quality_dash
  property default_home : String? = CONFIG.default_user_preferences.default_home
  property feed_menu : Array(String) = CONFIG.default_user_preferences.feed_menu
  property related_videos : Bool = CONFIG.default_user_preferences.related_videos

  @[JSON::Field(converter: Preferences::ProcessString)]
  property sort : String = CONFIG.default_user_preferences.sort
  property speed : Float32 = CONFIG.default_user_preferences.speed
  property thin_mode : Bool = CONFIG.default_user_preferences.thin_mode
  @[JSON::Field(converter: Preferences::UIDensity)]
  @[YAML::Field(converter: Preferences::UIDensity)]
  property ui_density : String = CONFIG.default_user_preferences.ui_density
  property unseen_only : Bool = CONFIG.default_user_preferences.unseen_only
  property video_loop : Bool = CONFIG.default_user_preferences.video_loop
  property extend_desc : Bool = CONFIG.default_user_preferences.extend_desc
  property volume : Int32 = CONFIG.default_user_preferences.volume
  property save_player_pos : Bool = CONFIG.default_user_preferences.save_player_pos
  property default_playlist : String? = nil
  property sponsorblock_enabled : Bool = CONFIG.default_user_preferences.sponsorblock_enabled
  @[JSON::Field(converter: Invidious::SponsorBlock::Modes)]
  @[YAML::Field(converter: Invidious::SponsorBlock::Modes)]
  property sponsorblock_modes : Hash(String, String) = CONFIG.default_user_preferences.sponsorblock_modes.dup
  @[JSON::Field(converter: Invidious::SponsorBlock::Colors)]
  @[YAML::Field(converter: Invidious::SponsorBlock::Colors)]
  property sponsorblock_colors : Hash(String, String) = CONFIG.default_user_preferences.sponsorblock_colors.dup
  property dearrow_enabled : Bool = CONFIG.default_user_preferences.dearrow_enabled
  property dearrow_show_original : Bool = CONFIG.default_user_preferences.dearrow_show_original
  property search_privacy : Bool = CONFIG.default_user_preferences.search_privacy

  module ThemeDeadline
    def self.from_json(value : JSON::PullParser) : Int64?
      JSON::Any.new(value).as_i64?.try { |time| time > 0 ? time : nil }
    end

    def self.to_json(value : Int64?, json : JSON::Builder)
      value.to_json(json)
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Int64?
      node.is_a?(YAML::Nodes::Scalar) ? node.value.to_i64?.try { |time| time > 0 ? time : nil } : nil
    end

    def self.to_yaml(value : Int64?, yaml : YAML::Nodes::Builder)
      value.to_yaml(yaml)
    end
  end

  # Use a dedicated converter: the general integer converter clamps page sizes.
  module ThemeInterval
    def self.normalize(value : Int) : Int32
      (1..168).includes?(value) ? value.to_i32 : 6
    end

    def self.from_json(value : JSON::PullParser) : Int32
      raw = JSON::Any.new(value)
      normalize(raw.as_i64? || 6)
    end

    def self.to_json(value : Int32, json : JSON::Builder)
      json.number normalize(value)
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Int32
      normalize(node.is_a?(YAML::Nodes::Scalar) ? (node.value.to_i64? || 6) : 6)
    end

    def self.to_yaml(value : Int32, yaml : YAML::Nodes::Builder)
      yaml.scalar normalize(value)
    end
  end

  module Theme
    def self.from_json(value : JSON::PullParser) : String
      Invidious::Themes.normalize(value.read_string)
    end

    def self.to_json(value : String, json : JSON::Builder)
      json.string Invidious::Themes.normalize(value)
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : String
      node.is_a?(YAML::Nodes::Scalar) ? Invidious::Themes.normalize(node.value) : Invidious::Themes::DEFAULT
    end

    def self.to_yaml(value : String, yaml : YAML::Nodes::Builder)
      yaml.scalar Invidious::Themes.normalize(value)
    end
  end

  module UIDensity
    def self.normalize(value : String) : String
      {"balanced", "compact"}.includes?(value) ? value : "balanced"
    end

    def self.from_json(value : JSON::PullParser) : String
      normalize(value.read_string)
    end

    def self.to_json(value : String, json : JSON::Builder)
      json.string normalize(value)
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : String
      node.is_a?(YAML::Nodes::Scalar) ? normalize(node.value) : "balanced"
    end

    def self.to_yaml(value : String, yaml : YAML::Nodes::Builder)
      yaml.scalar normalize(value)
    end
  end

  module BoolToString
    def self.to_json(value : String, json : JSON::Builder)
      json.string value
    end

    def self.from_json(value : JSON::PullParser) : String
      begin
        value.read_string
      rescue ex
        if value.read_bool
          "dark"
        else
          "light"
        end
      end
    end

    def self.to_yaml(value : String, yaml : YAML::Nodes::Builder)
      yaml.scalar value
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : String
      unless node.is_a?(YAML::Nodes::Scalar)
        node.raise "Expected scalar, not #{node.class}"
      end

      case node.value
      when "true"
        "dark"
      when "false"
        "light"
      else
        node.value
      end
    end
  end

  module ClampInt
    def self.to_json(value : Int32, json : JSON::Builder)
      json.number value
    end

    def self.from_json(value : JSON::PullParser) : Int32
      value.read_int.clamp(0, MAX_ITEMS_PER_PAGE).to_i32
    end

    def self.to_yaml(value : Int32, yaml : YAML::Nodes::Builder)
      yaml.scalar value
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Int32
      node.value.clamp(0, MAX_ITEMS_PER_PAGE)
    end
  end

  module FamilyConverter
    def self.to_yaml(value : Socket::Family, yaml : YAML::Nodes::Builder)
      case value
      when Socket::Family::UNSPEC
        yaml.scalar nil
      when Socket::Family::INET
        yaml.scalar "ipv4"
      when Socket::Family::INET6
        yaml.scalar "ipv6"
      when Socket::Family::UNIX
        raise "Invalid socket family #{value}"
      end
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Socket::Family
      if node.is_a?(YAML::Nodes::Scalar)
        case node.value.downcase
        when "ipv4"
          Socket::Family::INET
        when "ipv6"
          Socket::Family::INET6
        else
          Socket::Family::UNSPEC
        end
      else
        node.raise "Expected scalar, not #{node.class}"
      end
    end
  end

  module URIConverter
    def self.to_yaml(value : URI, yaml : YAML::Nodes::Builder)
      yaml.scalar value.normalize!
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : URI
      if node.is_a?(YAML::Nodes::Scalar)
        URI.parse node.value
      else
        node.raise "Expected scalar, not #{node.class}"
      end
    end
  end

  module ProcessString
    def self.to_json(value : String, json : JSON::Builder)
      json.string value
    end

    def self.from_json(value : JSON::PullParser) : String
      HTML.escape(value.read_string[0, 100])
    end

    def self.to_yaml(value : String, yaml : YAML::Nodes::Builder)
      yaml.scalar value
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : String
      HTML.escape(node.value[0, 100])
    end
  end

  module StringToArray
    def self.to_json(value : Array(String), json : JSON::Builder)
      json.array do
        value.each do |element|
          json.string element
        end
      end
    end

    def self.from_json(value : JSON::PullParser) : Array(String)
      begin
        result = [] of String
        value.read_array do
          result << HTML.escape(value.read_string[0, 100])
        end
      rescue ex
        result = [HTML.escape(value.read_string[0, 100]), ""]
      end

      result
    end

    def self.to_yaml(value : Array(String), yaml : YAML::Nodes::Builder)
      yaml.sequence do
        value.each do |element|
          yaml.scalar element
        end
      end
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Array(String)
      begin
        unless node.is_a?(YAML::Nodes::Sequence)
          node.raise "Expected sequence, not #{node.class}"
        end

        result = [] of String
        node.nodes.each do |item|
          unless item.is_a?(YAML::Nodes::Scalar)
            node.raise "Expected scalar, not #{item.class}"
          end

          result << HTML.escape(item.value[0, 100])
        end
      rescue ex
        if node.is_a?(YAML::Nodes::Scalar)
          result = [HTML.escape(node.value[0, 100]), ""]
        else
          result = ["", ""]
        end
      end

      result
    end
  end

  module StringToCookies
    def self.to_yaml(value : HTTP::Cookies, yaml : YAML::Nodes::Builder)
      (value.map { |c| "#{c.name}=#{c.value}" }).join("; ").to_yaml(yaml)
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : HTTP::Cookies
      unless node.is_a?(YAML::Nodes::Scalar)
        node.raise "Expected scalar, not #{node.class}"
      end

      cookies = HTTP::Cookies.new
      node.value.split(";").each do |cookie|
        next if cookie.strip.empty?
        name, value = cookie.split("=", 2)
        cookies << HTTP::Cookie.new(name.strip, value.strip)
      end

      cookies
    end
  end

  module TimeSpanConverter
    def self.to_yaml(value : Time::Span, yaml : YAML::Nodes::Builder)
      return yaml.scalar value.total_minutes.to_i32
    end

    def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : Time::Span
      if node.is_a?(YAML::Nodes::Scalar)
        return decode_interval(node.value)
      else
        node.raise "Expected scalar, not #{node.class}"
      end
    end
  end
end

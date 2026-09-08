# The only source of theme IDs and asset URLs. Never build URLs from preferences.
module Invidious::Themes
  DEFAULT = "modern-neon"

  record Theme, id : String, name : String, stylesheet : String, preview : String

  AVAILABLE = [
    Theme.new(DEFAULT, "Modern Neon", "/themes/modern-neon/theme.css", "/themes/modern-neon/preview.svg"),
  ]

  def self.resolve(id : String) : Theme
    AVAILABLE.find { |theme| theme.id == id } || AVAILABLE.find! { |theme| theme.id == DEFAULT }
  end

  def self.normalize(id : String) : String
    resolve(id).id
  end
end

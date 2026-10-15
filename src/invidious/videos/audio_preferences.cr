require "json"
require "yaml"
require "./audio_metadata"

# Logical audio choices are independent of expiring URLs and rendition itags.
module Invidious::Videos::AudioPreferences
  LANGUAGES = {
    "af" => "Afrikaans", "sq" => "Albanian", "am" => "Amharic", "ar" => "Arabic",
    "hy" => "Armenian", "az" => "Azerbaijani", "bn" => "Bangla", "eu" => "Basque",
    "be" => "Belarusian", "bs" => "Bosnian", "bg" => "Bulgarian", "my" => "Burmese",
    "yue-HK" => "Cantonese (Hong Kong)", "ca" => "Catalan", "ceb" => "Cebuano",
    "zh" => "Chinese", "zh-CN" => "Chinese (China)", "zh-HK" => "Chinese (Hong Kong)",
    "zh-Hans" => "Chinese (Simplified)", "zh-TW" => "Chinese (Taiwan)", "zh-Hant" => "Chinese (Traditional)",
    "co" => "Corsican", "hr" => "Croatian", "cs" => "Czech", "da" => "Danish", "nl" => "Dutch",
    "en" => "English", "en-GB" => "English (United Kingdom)", "en-US" => "English (United States)",
    "eo" => "Esperanto", "et" => "Estonian", "fil" => "Filipino", "fi" => "Finnish", "fr" => "French",
    "gl" => "Galician", "ka" => "Georgian", "de" => "German", "el" => "Greek", "gu" => "Gujarati",
    "ht" => "Haitian Creole", "ha" => "Hausa", "haw" => "Hawaiian", "he" => "Hebrew", "hi" => "Hindi",
    "hmn" => "Hmong", "hu" => "Hungarian", "is" => "Icelandic", "ig" => "Igbo", "id" => "Indonesian",
    "ie" => "Interlingue", "ga" => "Irish", "it" => "Italian", "ja" => "Japanese", "jv" => "Javanese",
    "kn" => "Kannada", "kk" => "Kazakh", "km" => "Khmer", "ko" => "Korean", "ku" => "Kurdish",
    "ky" => "Kyrgyz", "lo" => "Lao", "la" => "Latin", "lv" => "Latvian", "lt" => "Lithuanian",
    "lb" => "Luxembourgish", "mk" => "Macedonian", "mg" => "Malagasy", "ms" => "Malay",
    "ml" => "Malayalam", "mt" => "Maltese", "mi" => "Maori", "mr" => "Marathi", "mn" => "Mongolian",
    "ne" => "Nepali", "nb" => "Norwegian Bokmål", "ny" => "Nyanja", "ps" => "Pashto", "fa" => "Persian",
    "pl" => "Polish", "pt" => "Portuguese", "pt-BR" => "Portuguese (Brazil)", "pt-PT" => "Portuguese (Portugal)",
    "pa" => "Punjabi", "ro" => "Romanian", "ru" => "Russian", "sm" => "Samoan", "gd" => "Scottish Gaelic",
    "sr" => "Serbian", "sn" => "Shona", "sd" => "Sindhi", "si" => "Sinhala", "sk" => "Slovak",
    "sl" => "Slovenian", "so" => "Somali", "st" => "Southern Sotho", "es" => "Spanish",
    "es-419" => "Spanish (Latin America)", "es-MX" => "Spanish (Mexico)", "es-ES" => "Spanish (Spain)",
    "su" => "Sundanese", "sw" => "Swahili", "sv" => "Swedish", "tg" => "Tajik", "ta" => "Tamil",
    "te" => "Telugu", "th" => "Thai", "tr" => "Turkish", "uk" => "Ukrainian", "ur" => "Urdu",
    "uz" => "Uzbek", "vi" => "Vietnamese", "cy" => "Welsh", "fy" => "Western Frisian", "xh" => "Xhosa",
    "yi" => "Yiddish", "yo" => "Yoruba", "zu" => "Zulu",
  }

  def self.normalize(value : String?) : String
    return "original" if value == "original"
    return "original_stable" if value == "original_stable"
    LANGUAGES.each_key do |tag|
      return tag if tag.compare(value.to_s.tr("_", "-"), case_insensitive: true) == 0
    end
    "original"
  end

  def self.from_json(pull : JSON::PullParser) : String
    normalize(JSON::Any.new(pull).as_s?)
  end

  def self.to_json(value : String, json : JSON::Builder)
    json.string normalize(value)
  end

  def self.from_yaml(ctx : YAML::ParseContext, node : YAML::Nodes::Node) : String
    normalize(node.is_a?(YAML::Nodes::Scalar) ? node.value : nil)
  end

  def self.to_yaml(value : String, yaml : YAML::Nodes::Builder)
    yaml.scalar normalize(value)
  end

  def self.identity(fmt : Hash(String, JSON::Any)) : String
    fmt["audioTrack"]?.try(&.as_h?).try(&.["id"]?).try(&.as_s?) || ""
  end

  def self.language(fmt : Hash(String, JSON::Any)) : String
    identity(fmt).split('.').first.downcase.tr("_", "-")
  end

  def self.original?(fmt : Hash(String, JSON::Any)) : Bool
    track = fmt["audioTrack"]?.try &.as_h?
    track.try(&.["audioIsDefault"]?).try(&.as_bool?) == true ||
      !!track.try(&.["displayName"]?).try(&.as_s?).try(&.matches?(/\boriginal\b/i))
  end

  def self.originals(streams : Array(Hash(String, JSON::Any))) : Array(Hash(String, JSON::Any))
    known = streams.select { |fmt| original?(fmt) }
    # DRC copies sometimes omit the original flag but retain the same language.
    streams.select do |fmt|
      original?(fmt) || (AudioMetadata.stable_volume?(fmt) && !language(fmt).empty? && known.any? { |other| language(other) == language(fmt) })
    end
  end

  def self.select(streams : Array(Hash(String, JSON::Any)), preference : String) : Array(Hash(String, JSON::Any))
    original = originals(streams)
    regular = original.reject { |fmt| AudioMetadata.stable_volume?(fmt) }
    if preference == "original_stable"
      stable = original.select { |fmt| AudioMetadata.stable_volume?(fmt) }
      return stable unless stable.empty?
    elsif preference != "original"
      tag = preference.downcase
      available = streams.reject { |fmt| AudioMetadata.stable_volume?(fmt) }
      matches = available.select { |fmt| language(fmt) == tag }
      if matches.empty? && !tag.includes?('-')
        matches = available.select { |fmt| language(fmt).split('-').first == tag }
      end
      return matches unless matches.empty?
    end
    return regular unless regular.empty?
    return original unless original.empty?
    # Without original identity metadata, retain the existing playable default.
    first = streams.first?
    first ? streams.select { |fmt| identity(fmt) == identity(first) && AudioMetadata.stable_volume?(fmt) == AudioMetadata.stable_volume?(first) } : streams
  end

  def self.resolve(streams : Array(Hash(String, JSON::Any)), itag : Int32?, track : String, stable : Bool) : Hash(String, JSON::Any)?
    exact = streams.select { |fmt| identity(fmt) == track && AudioMetadata.stable_volume?(fmt) == stable }
    candidates = exact.empty? ? self.select(streams, "original") : exact
    candidates.find { |fmt| fmt["itag"]?.try(&.as_i?) == itag } || best(candidates)
  end

  def self.best(streams : Array(Hash(String, JSON::Any))) : Hash(String, JSON::Any)?
    streams.max_by? { |fmt| {fmt["mimeType"]?.try(&.as_s?).to_s.starts_with?("audio/mp4") ? 1 : 0, fmt["bitrate"]?.try(&.as_i?) || 0} }
  end
end

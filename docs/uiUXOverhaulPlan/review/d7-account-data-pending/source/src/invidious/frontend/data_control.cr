module Invidious::Frontend::DataControl
  extend self

  SOURCES = {
    "invidious"             => {field: "import_invidious", label: "Import Invidious data", accept: ".json,application/json", help: "ux_data_invidious"},
    "youtube"               => {field: "import_youtube", label: "Import YouTube subscriptions", accept: ".opml,.xml,.json,.csv,text/xml,application/xml,application/json,text/csv", help: "ux_data_youtube"},
    "youtube-playlist"      => {field: "import_youtube_pl", label: "Import YouTube playlist (.csv)", accept: ".csv,text/csv", help: "ux_data_youtube_playlist"},
    "youtube-history"       => {field: "import_youtube_wh", label: "Import YouTube watch history (.json)", accept: ".json,application/json", help: "ux_data_youtube_history"},
    "freetube"              => {field: "import_freetube", label: "Import FreeTube subscriptions (.db)", accept: ".db", help: "ux_data_freetube"},
    "newpipe-subscriptions" => {field: "import_newpipe_subscriptions", label: "Import NewPipe subscriptions (.json)", accept: ".json,application/json", help: "ux_data_newpipe_subscriptions"},
    "newpipe"               => {field: "import_newpipe", label: "Import NewPipe data (.zip)", accept: ".zip,application/zip", help: "ux_data_newpipe"},
  }

  def source(raw : String?)
    raw && SOURCES.has_key?(raw) ? raw : "invidious"
  end
end

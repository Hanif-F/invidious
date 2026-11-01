module Invidious::Frontend::PlaylistForms
  extend self

  def validate(params : URI::Params, edit = false) : {String, String}?
    title = params["title"]?.try(&.strip) || ""
    return {"title", "overhaul_playlist_title_required"} if title.empty?
    # Preserve the existing 150-byte title bound without cutting a UTF-8 string.
    return {"title", "overhaul_playlist_title_long"} if title.bytesize > 150
    return {"privacy", "overhaul_playlist_privacy_invalid"} unless PlaylistPrivacy.parse?(params["privacy"]? || "")
    return {"description", "overhaul_playlist_description_long"} if edit && (params["description"]? || "").delete('\r').size > 5000
    nil
  end
end

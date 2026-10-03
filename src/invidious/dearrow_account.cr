module Invidious::DeArrow::AccountContributions
  extend self

  def require_storage
    unless DeArrow::IdentityCipher.ready?(CONFIG.dearrow_identity_key)
      raise DeArrow::ContributionError.new(503, "The instance administrator must configure DeArrow contribution storage.")
    end
  end

  def import_identity(email : String, private_id : String)
    require_storage
    id = private_id.strip
    return if id.empty?
    unless DeArrow::IdentityCipher.valid_id?(id)
      raise DeArrow::ContributionError.new(400, "Enter a private user ID of 30–256 letters, numbers, underscores or hyphens; not a public ID or license key.")
    end
    Database::DeArrowIdentities.import(email, id, CONFIG.dearrow_identity_key)
  end

  def submit(email : String, id : String, action : String, title : String = "", confirmed : Bool = false,
             uuid : String = "", original : Bool = false, client = DeArrow::CONTRIBUTIONS)
    require_storage
    raise DeArrow::ContributionError.new(400, "Invalid video ID") unless DeArrow.valid_id?(id)
    downvote = false
    if action == "submit"
      title = title.strip
      if title.empty? || title.size > 110 || title.includes?('\n') || title.includes?('\r') || !confirmed
        raise DeArrow::ContributionError.new(400, "Enter a title of at most 110 characters and acknowledge all four guidelines.")
      end
      original = false
    elsif action == "upvote" || action == "downvote"
      downvote = action == "downvote"
      titles = client.titles(id)
      if original
        entry = titles.find(&.original)
        if downvote && (!entry || entry.locked)
          raise DeArrow::ContributionError.new(409, "The original title is not available for downvoting.")
        end
        title = entry ? entry.title : get_video(id).title
      else
        entry = titles.find { |item| item.uuid == uuid && !item.original }
        raise DeArrow::ContributionError.new(409, "This submission is no longer available. Refresh the list.") unless entry
        raise DeArrow::ContributionError.new(403, "This title is locked.") if downvote && entry.locked
        title = entry.title
      end
    else
      raise DeArrow::ContributionError.new(400, "Invalid action")
    end
    identity = Database::DeArrowIdentities.identity(email, CONFIG.dearrow_identity_key)
    client.submit(id, identity, title, original, downvote, CURRENT_VERSION)
    DeArrow::CLIENT.invalidate(id)
  end
end

require "./database/playback_positions"
require "./database/videos"

module Invidious::PlaybackProgress
  extend self

  private alias Positions = Invidious::Database::PlaybackPositions

  class MetadataUnavailable < InfoException
    def initialize(cause : Exception? = nil)
      super("Could not verify the video genre for playback position.", cause)
    end
  end

  def select_all(email : String) : Array(Positions::Entry)
    entries = Positions.select_all(email)
    metadata = Database::Videos.select_metadata(entries.map(&.[:video_id]))
    eligible = [] of Positions::Entry
    ineligible = [] of Positions::Entry

    visible = entries.select do |entry|
      observed = cached_eligibility(metadata[entry[:video_id]]?)
      if observed.nil?
        entry[:resume_eligible] == true
      else
        if observed != entry[:resume_eligible]
          (observed ? eligible : ineligible) << entry
        end
        observed
      end
    end

    Positions.set_resume_eligibility(email, eligible, true)
    Positions.set_resume_eligibility(email, ineligible, false)
    visible
  end

  def select(email : String, video_id : String) : Positions::Entry?
    return unless entry = Positions.select(email, video_id)

    metadata = Database::Videos.select_metadata([video_id])[video_id]?
    eligible = cached_eligibility(metadata)
    if eligible.nil?
      eligible = entry[:resume_eligible]
      eligible = fetch_eligibility(video_id) if eligible.nil?
    end
    return if eligible.nil?

    if eligible != entry[:resume_eligible]
      Positions.set_resume_eligibility(email, [entry], eligible)
    end
    entry if eligible
  end

  def save(email : String, video_id : String, seconds : Int32)
    updated_at = Time.utc
    case fetch_eligibility(video_id)
    when true
      Positions.upsert(email, video_id, seconds, updated_at, resume_eligible: true)
    when false
      if entry = Positions.select(email, video_id)
        Positions.set_resume_eligibility(email, [entry], false)
      end
    else
      raise MetadataUnavailable.new
    end
  end

  private def cached_eligibility(metadata : JSON::Any?) : Bool?
    if genre = metadata.try(&.as_h?).try(&.["genre"]?).try(&.as_s?)
      !Video.music_genre?(genre)
    end
  end

  private def fetch_eligibility(video_id : String) : Bool?
    !get_video(video_id, refresh: false).music_genre?
  rescue NotFoundException
    nil
  rescue ex
    raise MetadataUnavailable.new(ex)
  end
end

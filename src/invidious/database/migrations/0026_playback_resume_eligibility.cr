module Invidious::Database::Migrations
  class PlaybackResumeEligibility < Migration
    version 26

    def up(conn : DB::Connection)
      conn.exec("ALTER TABLE public.playback_positions ADD COLUMN IF NOT EXISTS resume_eligible boolean")
    end
  end
end

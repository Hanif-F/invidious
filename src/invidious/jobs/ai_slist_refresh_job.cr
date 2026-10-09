class Invidious::Jobs::AiSListRefreshJob < Invidious::Jobs::BaseJob
  def begin
    loop do
      failed = Invidious::AiSList.runtime.lists.refresh
      LOGGER.warn("AiSList refresh failed for #{failed.join(", ")}; retaining cached lists") unless failed.empty?
      begin
        PG_DB.exec("DELETE FROM channel_handles WHERE expires_at < now() - interval '7 days'")
      rescue ex
        LOGGER.warn("AiSList handle cache cleanup failed: #{ex.message}")
      end
      sleep Invidious::AiSList::REFRESH_INTERVAL
    end
  end
end

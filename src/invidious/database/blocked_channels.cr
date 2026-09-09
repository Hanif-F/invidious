module Invidious::Database::BlockedChannels
  extend self

  def list(email : String)
    PG_DB.query_all("SELECT ucid, name FROM blocked_channels WHERE email = $1 ORDER BY name, ucid",
      email, as: {String, String})
  end

  def ids(email : String) : Array(String)
    PG_DB.query_all("SELECT ucid FROM blocked_channels WHERE email = $1", email, as: String)
  end

  def block(email : String, ucid : String, name : String)
    PG_DB.exec("INSERT INTO blocked_channels (email, ucid, name) VALUES ($1, $2, $3) ON CONFLICT (email, ucid) DO NOTHING",
      email, ucid, name)
  end

  def unblock(email : String, ucid : String)
    PG_DB.exec("DELETE FROM blocked_channels WHERE email = $1 AND ucid = $2", email, ucid)
  end
end

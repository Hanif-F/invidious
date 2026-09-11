require "./dearrow"

module Invidious::DeArrow
  class ContributionError < Exception
    getter status : Int32

    def initialize(@status : Int32, message : String)
      super(message)
    end
  end

  struct Submission
    include JSON::Serializable
    getter title : String
    getter original : Bool
    getter votes : Int32
    getter locked : Bool
    @[JSON::Field(key: "UUID")]
    getter uuid : String
  end

  class Contributions
    # Inject transport in tests; never send real contributions during verification.
    def initialize(@transport : Proc(String, String, String?, HTTP::Client::Response) = ->DeArrow.contribution_request(String, String, String?))
    end

    def titles(id : String) : Array(Submission)
      raise ContributionError.new(400, "Invalid video ID") unless DeArrow.valid_id?(id)
      prefix = Digest::SHA256.hexdigest(id)[0, 4]
      response = @transport.call("GET", "/api/branding/#{prefix}?fetchAll=true", nil)
      return [] of Submission if response.status_code == 404
      check(response)
      branding = JSON.parse(response.body)[id]?
      return [] of Submission unless branding
      Array(Submission).from_json(branding["titles"].to_json)
    rescue ex : ContributionError
      raise ex
    rescue
      raise ContributionError.new(502, "Could not load DeArrow submissions. Try again.")
    end

    def submit(id : String, user_id : String, title : String, original : Bool, downvote : Bool, version : String)
      body = {
        videoID: id, userID: user_id, userAgent: "Invidious/#{version}", service: "YouTube",
        title: {title: title, original: original}, downvote: downvote, autoLock: false,
      }.to_json
      check(@transport.call("POST", "/api/branding", body))
    rescue ex : ContributionError
      raise ex
    rescue
      # A timeout may occur after upstream accepted the write. Do not retry it.
      raise ContributionError.new(502, "DeArrow did not confirm this action. Refresh submissions before trying again.")
    end

    private def check(response : HTTP::Client::Response)
      return if response.status_code.in?(200..299)
      status, message = case response.status_code
                        when 400 then {400, "DeArrow rejected this title or vote. Check the title and guidelines."}
                        when 403 then {403, "DeArrow did not allow this action. The submission may be locked or your identity restricted."}
                        when 429 then {429, "DeArrow is receiving too many requests. Please wait before trying again."}
                        else          {502, "DeArrow is unavailable. Please try again later."}
                        end
      # Do not relay upstream bodies, which could contain submitted credentials.
      raise ContributionError.new(status, message)
    end
  end

  CONTRIBUTION_SLOTS = ::Channel(Nil).new(4)
  4.times { CONTRIBUTION_SLOTS.send(nil) }

  def self.contribution_request(method : String, path : String, body : String?) : HTTP::Client::Response
    select
    when CONTRIBUTION_SLOTS.receive
    else
      raise ContributionError.new(429, "DeArrow is busy. Please try again shortly.")
    end
    client = HTTP::Client.new(URI.parse("https://sponsor.ajay.app"))
    client.connect_timeout = 2.seconds
    client.read_timeout = 5.seconds
    begin
      client.exec(method, path, headers: HTTP::Headers{"Content-Type" => "application/json"}, body: body)
    ensure
      client.close
      CONTRIBUTION_SLOTS.send(nil)
    end
  end

  CONTRIBUTIONS = Contributions.new
end

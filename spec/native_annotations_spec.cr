require "spec"
require "http/client"
require "../src/invidious/routes/api/v1/videos"

describe Invidious::Routes::API::V1::Videos do
  it "preserves direct missing-archive errors and direct XML without requesting a missing Location" do
    {404, 503, 200}.each do |status|
      body = status == 200 ? "<document><annotations/></document>" : "Archive unavailable"
      direct = HTTP::Client::Response.new(status, body: body)
      result = Invidious::Routes::API::V1::Videos.annotation_archive_response(direct) { raise "Unexpected redirect request" }
      result.status_code.should eq(status)
      result.body.should eq(body)
    end
  end

  it "fetches the archive redirect once and preserves its response" do
    redirect = HTTP::Client::Response.new(302, headers: HTTP::Headers{"Location" => "https://archive.test/video.xml"})
    requests = [] of String
    result = Invidious::Routes::API::V1::Videos.annotation_archive_response(redirect) do |target|
      requests << target
      HTTP::Client::Response.new(200, body: "<document/>")
    end
    requests.should eq(["https://archive.test/video.xml"])
    result.status_code.should eq(200)
    result.body.should eq("<document/>")
  end
end

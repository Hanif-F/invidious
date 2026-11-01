require "../../../src/invidious/search/filters"
require "../../../src/invidious/search/query"

require "http/params"
require "spectator"

Spectator.configure do |config|
  config.fail_blank
  config.randomize
end

Spectator.describe Invidious::Search::Query do
  describe Type::Regular do
    # -------------------
    #  Query parsing
    # -------------------

    it "parses query with URL prameters (q)" do
      query = described_class.new(
        HTTP::Params.parse("q=What+is+Love+10+hour&type=video&duration=long"),
        Invidious::Search::Query::Type::Regular, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Regular)
      expect(query.channel).to be_empty
      expect(query.text).to eq("What is Love 10 hour")

      expect(query.filters).to eq(
        Invidious::Search::Filters.new(
          type: Invidious::Search::Filters::Type::Video,
          duration: Invidious::Search::Filters::Duration::Long
        )
      )
    end

    it "parses query with URL prameters (search_query)" do
      query = described_class.new(
        HTTP::Params.parse("search_query=What+is+Love+10+hour&type=video&duration=long"),
        Invidious::Search::Query::Type::Regular, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Regular)
      expect(query.channel).to be_empty
      expect(query.text).to eq("What is Love 10 hour")

      expect(query.filters).to eq(
        Invidious::Search::Filters.new(
          type: Invidious::Search::Filters::Type::Video,
          duration: Invidious::Search::Filters::Duration::Long
        )
      )
    end

    it "parses query with legacy filters (q)" do
      query = described_class.new(
        HTTP::Params.parse("q=Nyan+cat+duration:long"),
        Invidious::Search::Query::Type::Regular, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Regular)
      expect(query.channel).to be_empty
      expect(query.text).to eq("Nyan cat")

      expect(query.filters).to eq(
        Invidious::Search::Filters.new(
          duration: Invidious::Search::Filters::Duration::Long
        )
      )
    end

    it "parses query with legacy filters (search_query)" do
      query = described_class.new(
        HTTP::Params.parse("search_query=Nyan+cat+duration:long"),
        Invidious::Search::Query::Type::Regular, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Regular)
      expect(query.channel).to be_empty
      expect(query.text).to eq("Nyan cat")

      expect(query.filters).to eq(
        Invidious::Search::Filters.new(
          duration: Invidious::Search::Filters::Duration::Long
        )
      )
    end

    it "parses query with both URL params and legacy filters" do
      query = described_class.new(
        HTTP::Params.parse("q=Vamos+a+la+playa+duration:long&type=Video&date=year"),
        Invidious::Search::Query::Type::Regular, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Regular)
      expect(query.channel).to be_empty
      expect(query.text).to eq("Vamos a la playa duration:long")

      expect(query.filters).to eq(
        Invidious::Search::Filters.new(
          type: Invidious::Search::Filters::Type::Video,
          date: Invidious::Search::Filters::Date::Year
        )
      )
    end

    # -------------------
    #  Type switching
    # -------------------

    it "switches to channel search (URL param)" do
      query = described_class.new(
        HTTP::Params.parse("q=thunderbolt+4&channel=UC0vBXGSyV14uvJ4hECDOl0Q"),
        Invidious::Search::Query::Type::Regular, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Channel)
      expect(query.channel).to eq("UC0vBXGSyV14uvJ4hECDOl0Q")
      expect(query.text).to eq("thunderbolt 4")
      expect(query.filters.default?).to be_true
    end

    it "switches to channel search (legacy)" do
      query = described_class.new(
        HTTP::Params.parse("q=channel%3AUCRPdsCVuH53rcbTcEkuY4uQ+rdna3"),
        Invidious::Search::Query::Type::Regular, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Channel)
      expect(query.channel).to eq("UCRPdsCVuH53rcbTcEkuY4uQ")
      expect(query.text).to eq("rdna3")
      expect(query.filters.default?).to be_true
    end

    it "switches to subscriptions search" do
      query = described_class.new(
        HTTP::Params.parse("q=subscriptions:true+tunak+tunak+tun"),
        Invidious::Search::Query::Type::Regular, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Subscriptions)
      expect(query.channel).to be_empty
      expect(query.text).to eq("tunak tunak tun")
      expect(query.filters.default?).to be_true
    end
  end

  describe Type::Channel do
    it "keeps the route channel when query parameters and operators name other channels" do
      query = described_class.new(
        HTTP::Params{"q" => "channel:UCother user:another tutorial", "channel" => "UCoverride", "page" => "2"},
        :channel
      )
      query.channel = "UCcurrent"

      expect(query.channel).to eq("UCcurrent")
      expect(query.text).to eq("tutorial")
      expect(query.page).to eq(2)
      expect(query.type).to eq(Invidious::Search::Query::Type::Channel)
    end

    it "preserves special characters through channel search pagination parameters" do
      text = %(<cats> & "dogs" + café)
      query = described_class.new(HTTP::Params{"q" => text}, :channel)
      query.channel = "UCcurrent"
      params = HTTP::Params.parse(query.to_http_params.to_s)

      expect(params["q"]).to eq(text)
      expect(params["channel"]).to eq("UCcurrent")
    end

    it "recognizes whitespace-only channel searches as empty" do
      query = described_class.new(HTTP::Params{"q" => "  \t  "}, :channel)
      expect(query.empty?).to be_true
    end

    it "ignores extra parameters" do
      query = described_class.new(
        HTTP::Params.parse("q=Take+on+me+channel%3AUC12345679&type=video&date=year"),
        Invidious::Search::Query::Type::Channel, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Channel)
      expect(query.channel).to be_empty
      expect(query.text).to eq("Take on me")
      expect(query.filters.default?).to be_true
    end
  end

  describe Type::Subscriptions do
    it "works" do
      query = described_class.new(
        HTTP::Params.parse("q=Harlem+shake&type=video&date=year"),
        Invidious::Search::Query::Type::Subscriptions, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Subscriptions)
      expect(query.channel).to be_empty
      expect(query.text).to eq("Harlem shake")

      expect(query.filters).to eq(
        Invidious::Search::Filters.new(
          type: Invidious::Search::Filters::Type::Video,
          date: Invidious::Search::Filters::Date::Year
        )
      )
    end
  end

  describe Type::Playlist do
    it "ignores extra parameters" do
      query = described_class.new(
        HTTP::Params.parse("q=Harlem+shake+type:video+date:year&channel=UC12345679"),
        Invidious::Search::Query::Type::Playlist, nil
      )

      expect(query.type).to eq(Invidious::Search::Query::Type::Playlist)
      expect(query.channel).to be_empty
      expect(query.text).to eq("Harlem shake")

      expect(query.filters).to eq(
        Invidious::Search::Filters.new(
          type: Invidious::Search::Filters::Type::Video,
          date: Invidious::Search::Filters::Date::Year
        )
      )
    end
  end

  describe "#to_http_params" do
    it "formats regular search" do
      query = described_class.new(
        HTTP::Params.parse("q=The+Simpsons+hiding+in+bush&duration=short"),
        Invidious::Search::Query::Type::Regular, nil
      )

      params = query.to_http_params

      expect(params).to have_key("duration")
      expect(params["duration"]?).to eq("short")

      expect(params).to have_key("q")
      expect(params["q"]?).to eq("The Simpsons hiding in bush")

      # Check if there aren't other parameters
      params.delete("duration")
      params.delete("q")
      expect(params).to be_empty
    end

    it "formats channel search" do
      query = described_class.new(
        HTTP::Params.parse("q=channel:UC2DjFE7Xf11URZqWBigcVOQ%20multimeter"),
        Invidious::Search::Query::Type::Regular, nil
      )

      params = query.to_http_params

      expect(params).to have_key("channel")
      expect(params["channel"]?).to eq("UC2DjFE7Xf11URZqWBigcVOQ")

      expect(params).to have_key("q")
      expect(params["q"]?).to eq("multimeter")

      # Check if there aren't other parameters
      params.delete("channel")
      params.delete("q")
      expect(params).to be_empty
    end
  end
end

Spectator.describe "Blocked channel search override" do
  it "excludes blocked channels unless explicitly included" do
    query = Invidious::Search::Query.new(HTTP::Params.parse("q=cats"))
    expect(query.include_blocked).to be_false
    expect(query.to_http_params.has_key?("include_blocked")).to be_false
  end

  it "preserves the override alongside other filters in pagination parameters" do
    query = Invidious::Search::Query.new(HTTP::Params.parse("q=cats&type=video&page=3&include_blocked=1"))
    expect(query.include_blocked).to be_true
    expect(query.to_http_params["include_blocked"]).to eq("1")
    expect(query.to_http_params["type"]).to eq("video")
    expect(query.page).to eq(3)
  end
end

Spectator.describe Invidious::Search::Query do
  it "preserves both explicit member choices and the unchecked blocked override" do
    {"0", "1"}.each do |value|
      query = described_class.new(HTTP::Params.parse("q=cats&show_member_videos=#{value}&include_blocked=0"))
      expect(query.show_member_videos).to eq(value == "1")
      expect(query.to_http_params["show_member_videos"]).to eq(value)
      expect(query.to_http_params["include_blocked"]).to eq("0")
    end
    query = described_class.new(HTTP::Params.parse("q=cats"))
    expect(query.show_member_videos).to be_nil
    expect(query.to_http_params.has_key?("show_member_videos")).to be_false
  end
end

Spectator.describe Invidious::Search::Query do
  it "retains a literal URL escape through filter and continuation parameters" do
    input = "\\https://youtu.be/aaaaaaaaaaa"
    query = described_class.new(HTTP::Params{"q" => input, "duration" => "short"}, :regular)
    expect(query.url?).to be_false
    expect(query.input).to eq(input)
    restored = described_class.new(query.to_http_params, :regular)
    expect(restored.url?).to be_false
    expect(restored.text).to eq(query.text)
    expect(restored.filters.duration).to eq(query.filters.duration)
  end

  it "retains subscription search scope across pagination" do
    query = described_class.new(HTTP::Params{"q" => "subscriptions:true light"}, :regular)
    restored = described_class.new(query.to_http_params, :regular)
    expect(restored.type).to eq(Invidious::Search::Query::Type::Subscriptions)
    expect(restored.text).to eq("light")
  end

  it "retains explicit channel search scope across pagination" do
    query = described_class.new(HTTP::Params{"q" => "channel:UCfixture light"}, :regular)
    restored = described_class.new(query.to_http_params, :regular)
    expect(restored.type).to eq(Invidious::Search::Query::Type::Channel)
    expect(restored.channel).to eq("UCfixture")
    expect(restored.text).to eq("light")
  end
end

Spectator.describe Invidious::Search::Query do
  it "retains the effective upstream region with continuation and filter parameters" do
    query = described_class.new(HTTP::Params{"q" => "light", "duration" => "short"}, :regular, "ID")
    expect(query.to_http_params["region"]).to eq("ID")
    expect(query.to_http_params["q"]).to eq("light")
    expect(query.to_http_params["duration"]).to eq("short")
  end
end

Spectator.describe Invidious::Search::Query do
  it "keeps explicit subscription scope and literal input through form pagination" do
    query = described_class.new(HTTP::Params{"q" => "\\https://youtu.be/abcdefghijk", "subscriptions" => "true", "page" => "2"}, :regular)
    expect(query.type).to eq(Invidious::Search::Query::Type::Subscriptions)
    expect(query.to_http_params["q"]).to eq("\\https://youtu.be/abcdefghijk")
    restored = described_class.new(query.to_http_params, :regular)
    expect(restored.type).to eq(Invidious::Search::Query::Type::Subscriptions)
    expect(restored.input).to eq(query.input)
  end

  it "keeps an explicit subscription scope when legacy channel text is supplied" do
    query = described_class.new(HTTP::Params{"q" => "channel:UCfixture light", "subscriptions" => "true"}, :regular)
    expect(query.type).to eq(Invidious::Search::Query::Type::Subscriptions)
    expect(query.channel).to be_empty
    expect(query.text).to eq("light")
  end

  it "retains explicit playlist-item filters, region and literal query across pages" do
    query = described_class.new(HTTP::Params{"q" => "\\https://example.test/a", "date" => "week", "duration" => "short", "page" => "2"}, :playlist, "ID")
    restored = described_class.new(query.to_http_params, :playlist, query.region)
    expect(restored.type).to eq(Invidious::Search::Query::Type::Playlist)
    expect(restored.filters.type).to eq(Invidious::Search::Filters::Type::Video)
    expect(restored.filters.date).to eq(Invidious::Search::Filters::Date::Week)
    expect(restored.filters.duration).to eq(Invidious::Search::Filters::Duration::Short)
    expect(restored.input).to eq(query.input)
    expect(restored.region).to eq("ID")
  end
end

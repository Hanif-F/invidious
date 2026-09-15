require "spectator"
require "json"
require "../../../src/invidious/helpers/membership"
require "../../../src/invidious/frontend/member_videos"

private record MembershipItem, id : String, members_only : Bool
private record UnknownMembershipItem, id : String

Spectator.describe Invidious::Videos::Membership do
  it "recognizes membership badge styles without relying on translated labels" do
    video = JSON.parse(%({"badges":[{"metadataBadgeRenderer":{"style":"BADGE_STYLE_TYPE_MEMBERS_ONLY","label":"Solo miembros"}}]}))
    expect(described_class.detected?(video)).to be_true
  end

  it "recognizes standalone and modern thumbnail/metadata membership badges" do
    [
      %({"topStandaloneBadge":{"metadataBadgeRenderer":{"label":"Members only"}}}),
      %({"contentImage":{"thumbnailViewModel":{"overlays":[{"thumbnailBottomOverlayViewModel":{"badges":[{"thumbnailBadgeViewModel":{"text":"Members only"}}]}}]}}}),
      %({"metadata":{"lockupMetadataViewModel":{"metadata":{"contentMetadataViewModel":{"metadataRows":[{"metadataParts":[{"text":{"content":"Members only"}}]}]}}}}}),
    ].each do |json|
      expect(described_class.detected?(JSON.parse(json))).to be_true
    end
  end

  it "does not confuse Premium, missing badges, Join buttons, or titles with membership" do
    [
      %({}), %({"badges":null}),
      %({"badges":[{"metadataBadgeRenderer":{"label":"Premium"}}]}),
      %({"title":"Members only","membershipButton":{"label":"Join"}}),
      %({"metadata":{"metadataRows":[{"metadataParts":[{"text":{"content":"Members only","commandRuns":[{}]}}]}]}}),
      %({"metadata":{"lockupMetadataViewModel":{"title":{"content":"Members only"}}}}),
    ].each do |json|
      expect(described_class.detected?(JSON.parse(json))).to be_false
    end
  end
end

Spectator.describe Invidious::Frontend::MemberVideos do
  it "keeps unknown items and never mutates cached lists" do
    items = [MembershipItem.new("member", true), MembershipItem.new("public", false), UnknownMembershipItem.new("unknown")]
    expect(described_class.filter(items, false).map(&.id)).to eq(["public", "unknown"])
    expect(described_class.filter(items, true)).to eq(items)
    expect(items.size).to eq(3)
  end

  it "removes members-only recommendations before autoplay selection" do
    items = [{"id" => "member", "members_only" => "true"}, {"id" => "public"}]
    expect(described_class.recommendations(items, false).first["id"]).to eq("public")
    expect(described_class.recommendations(items, true)).to eq(items)
  end

  it "preserves queue occurrence indexes and unclassified entries" do
    items = JSON.parse(%([{"videoId":"repeat","index":2,"isMember":true},{"videoId":"repeat","index":3},{"videoId":"last","index":5,"isMember":false}])).as_a
    expect(described_class.queue_videos(items, false).map(&.["index"].as_i)).to eq([3, 5])
    expect(described_class.queue_videos(items, true)).to eq(items)
    expect(items.size).to eq(3)
  end
end

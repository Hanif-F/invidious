require "spec"
require "../src/invidious/ai_slist_api"

private class AiApiStorage < Invidious::AiSList::Storage
  property saved = {} of String => Tuple(String, Time)

  def load_lists : Hash(String, Tuple(String, Time))
    saved
  end

  def save_list(kind : String, body : String, updated_at : Time) : Nil
    saved[kind] = {body, updated_at}
  end

  def load_handles(ids : Array(String)) : Hash(String, Invidious::AiSList::HandleEntry)
    {} of String => Invidious::AiSList::HandleEntry
  end

  def save_handles(entries : Hash(String, Invidious::AiSList::HandleEntry)) : Nil; end
end

describe Invidious::AiSList::Api do
  it "validates bounded canonical IDs and explicit kinds" do
    id = "UC#{"a" * 22}"
    Invidious::AiSList::Api.parameters("#{id},#{id}", "warnlist,blocklist").should eq({[id], %w(warnlist blocklist)})
    [{nil, "blocklist"}, {id, nil}, {"@creator", "warnlist"}, {id, "unknown"}, {Array.new(101, id).join(','), "blocklist"}, {id, ""}].each do |ids, kinds|
      expect_raises(ArgumentError) { Invidious::AiSList::Api.parameters(ids, kinds) }
    end
  end
  it "returns independent status and matches exact IDs and normalized handles" do
    storage = AiApiStorage.new
    first = "UC#{"a" * 22}"
    second = "UC#{"b" * 22}"
    lists = Invidious::AiSList::Lists.new(storage, ->(kind : String) { kind == "blocklist" ? "#{first}\n@both\n" : "@warning\n@both\n" })
    lists.refresh
    resolver = Invidious::AiSList::Resolver.new(storage, ->(_id : String) { raise "Unexpected metadata lookup"; nil.as(String?) })
    resolver.observe({first => "@both", second => "@WARNING"})
    result = Invidious::AiSList::Api.classify([first, second], %w(blocklist warnlist), lists, resolver)
    result[:channels][first][:matches].should eq(%w(blocklist warnlist))
    result[:channels][second][:matches].should eq(%w(warnlist))
    result[:channels][second][:resolved].should be_true
    result[:lists]["blocklist"][:channelCount].should eq(2)
    result[:lists]["blocklist"][:updatedAt].should_not be_nil
  end
  it "keeps unavailable lists and pending handles distinct from clean matches" do
    storage = AiApiStorage.new
    id = "UC#{"a" * 22}"
    lists = Invidious::AiSList::Lists.new(storage, ->(kind : String) { raise "Unavailable" if kind == "warnlist"; "#{id}\n" })
    lists.refresh.should eq(%w(warnlist))
    resolver = Invidious::AiSList::Resolver.new(storage, ->(_id : String) { raise "Direct matches must not resolve"; nil.as(String?) })
    result = Invidious::AiSList::Api.classify([id], %w(blocklist warnlist), lists, resolver)
    result[:channels][id][:matches].should eq(%w(blocklist))
    result[:channels][id][:resolved].should be_false
    result[:lists]["warnlist"][:available].should be_false
    result[:lists]["warnlist"][:stale].should be_true
    result[:lists]["warnlist"][:updatedAt].should be_nil
    Invidious::AiSList::Api.classify([id], %w(blocklist), lists, resolver)[:channels][id][:resolved].should be_true
  end
  it "returns unresolved results at the shared deadline and reuses later observations" do
    storage = AiApiStorage.new
    lists = Invidious::AiSList::Lists.new(storage, ->(_id : String) { "@known\n" })
    lists.refresh
    resolver = Invidious::AiSList::Resolver.new(storage, ->(_id : String) { nil.as(String?) }, waiter: ->(_signal : Channel(Nil), _budget : Time::Span) { nil })
    id = "UC#{"a" * 22}"
    Invidious::AiSList::Api.classify([id], %w(blocklist), lists, resolver)[:channels][id][:resolved].should be_false
    resolver.observe({id => "@different"})
    result = Invidious::AiSList::Api.classify([id], %w(blocklist), lists, resolver)[:channels][id]
    result[:resolved].should be_true
    result[:matches].should be_empty
  end
end

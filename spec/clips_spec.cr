require "spec"
require "../src/invidious/clips/validation"

describe Invidious::Clips::Validation do
  it "trims titles, counts Unicode characters, and preserves plain text" do
    Invidious::Clips::Validation.title("  日本語 <script> & clip  ").should eq("日本語 <script> & clip")
    Invidious::Clips::Validation.title("あ" * 140).size.should eq(140)
    ["", " \n ", "あ" * 141].each do |title|
      expect_raises(ArgumentError) { Invidious::Clips::Validation.title(title) }
    end
  end

  it "retains millisecond precision and rejects nonfinite, negative, and overflowing input" do
    Invidious::Clips::Validation.milliseconds("1.234").should eq(1234)
    Invidious::Clips::Validation.milliseconds("1.2346").should eq(1235)
    ["", "abc", "NaN", "Infinity", "-0.1", "1e100"].each do |value|
      expect_raises(ArgumentError) { Invidious::Clips::Validation.milliseconds(value) }
    end
  end

  it "accepts the exact duration boundaries and source end" do
    Invidious::Clips::Validation.range(0_i64, 5_000_i64, 5)
    Invidious::Clips::Validation.range(1_234_i64, 121_234_i64, 122)
    Invidious::Clips::Validation.range(115_000_i64, 120_000_i64, 120)
    [{0_i64, 4_999_i64}, {0_i64, 120_001_i64}, {-1_i64, 5_000_i64}, {115_001_i64, 120_001_i64}, {6_000_i64, 5_000_i64}].each do |bounds|
      expect_raises(ArgumentError) { Invidious::Clips::Validation.range(bounds[0], bounds[1], 120) }
    end
  end

  it "distinguishes native IDs from legacy YouTube IDs" do
    Invidious::Clips::Validation.valid_id?("IVCL" + "a_-1" * 8).should be_true
    Invidious::Clips::Validation.valid_id?("IVCLshort").should be_false
    Invidious::Clips::Validation.native?("UgkxYouTubeClip").should be_false
  end

  it "centers the initial selection and preserves its length at source boundaries" do
    Invidious::Clips::Validation.default_range(60.0, 200).should eq({45.0, 75.0})
    Invidious::Clips::Validation.default_range(0.0, 200).should eq({0.0, 30.0})
    Invidious::Clips::Validation.default_range(199.0, 200).should eq({170.0, 200.0})
    Invidious::Clips::Validation.default_range(5.0, 8).should eq({0.0, 8.0})
    Invidious::Clips::Validation.default_range(Float64::NAN, 200).should eq({0.0, 30.0})
    Invidious::Clips::Validation.default_range(60.999, 200).should eq({45.0, 75.0})
  end

  it "parses elapsed form timestamps while retaining legacy numeric seconds" do
    Invidious::Clips::Validation.form_time(" 00:01 ").should eq("1")
    Invidious::Clips::Validation.form_time("1:05").should eq("65")
    Invidious::Clips::Validation.form_time("01:00:05").should eq("3605")
    Invidious::Clips::Validation.form_time("25:01:05").should eq("90065")
    Invidious::Clips::Validation.form_time("10.25").should eq("10.25")
    ["00:60", "60:00", "01:60:00", "-1:00", "00:01.250", "1:2", "1::02", "999999999999999999999999:00:00"].each do |value|
      expect_raises(ArgumentError) { Invidious::Clips::Validation.form_time(value) }
    end
  end

  it "formats whole-second timestamps including hour crossings" do
    Invidious::Clips::Validation.timestamp(1.9).should eq("00:01")
    Invidious::Clips::Validation.timestamp(3599.0).should eq("59:59")
    Invidious::Clips::Validation.timestamp(3599.0, true).should eq("00:59:59")
    Invidious::Clips::Validation.timestamp(3605.0).should eq("01:00:05")
    Invidious::Clips::Validation.timestamp(90065.0).should eq("25:01:05")
  end
end

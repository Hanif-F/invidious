These fixtures support the learn-only comment/community avatar cache experiment.

- `modern_comments.json` retains three real comment view models and their author/toolbar mutations from a successful `next` comments response for `2isYuQZMbdU` on 2026-10-05. The unchanged application continuation builder was used. The full response supplied 20 comment author avatars.
- `community_posts.json` retains two real posts from the `UCXuqSBlHAE6Xw-yeJA0Tunw` posts tab, captured the same day with the unchanged browse builder. The full response contained 10 posts with author thumbnails. Attachments remain to verify that their images are not learned as avatars.
- `legacy_replies.json` adapts the first observed author, ID, avatar and publication text to the supported legacy reply shape. This is a synthetic transport fixture, not a separately captured legacy response.
- `expected_avatars.json` records the supplied author/avatar associations after the existing `/ggpht` and s88 normalization. The retained real examples contain four distinct channels.
- `baseline_output_digests.json` records 20 JSON/HTML outputs from clean `master` at `c3b584d1`, covering both thin-mode settings, modern comments, legacy replies, post comments, community listings and single posts. Only the wall-clock-derived `published` timestamp and its HTML calendar-date title are normalized for repeatability. All other fields and markup are compared unchanged.

Tracking, unused rendering controls and live continuations are removed. Original author identity and avatar structures are retained; no playback URLs are included. Exactly two verification metadata requests were made, both successful, without retries.

Before implementation, these examples produced their existing avatars in comment/post responses but learned zero channel avatars. The fixture harness now verifies one batch write per populated response, no reads during learning, unchanged responses, optional database failures, the normal fetch paths and cross-page cache reuse. Browser fixtures use subscription cards without supplied avatars and exercise the production cache lookup and rendering. Application metadata request builders, schema and cache update policy are unchanged.

Verification passed: 35 targeted parser/avatar examples, the production-template fixture harness, 24 Chromium/Firefox avatar/comment/recommendation checks, and the production Crystal compilation check (`--no-codegen`, `-Dskip_videojs_download`).

These fixtures verify learning Popular-page avatars from the existing channel-refresh request.

The experiment started from clean `master` at `6091cdb2` on 2026-10-05. Six verification metadata requests were made, with no retries, blocking or rate limiting. `verification.json` records every request, including an initial candidate that selected Home. Its returned Videos-tab endpoint supplied the parameter used by the verified implementation: `EgZ2aWRlb3PyBgQKAjoA`.

`baseline_ltt.json` and `baseline_mrbeast.json` retain the original continuation-style first listings. `candidate_ltt.json` and `candidate_mrbeast.json` retain the replacement Videos listings, their matching channel metadata/avatar and original Latest sorting state. Each first-page pair contains the same 30 video IDs in the same order, with equal titles, creator identities/names, durations, verification, membership and premiere metadata. One public view count changed between requests; member-only counts remained unavailable in both listings.

`continuation_ltt.json` retains the actual next page returned by the replacement's continuation: 30 more videos, no duplicates or overlap with its first page, and another continuation. Pagination was verified live for LTT. MrBeast's returned continuation structure is retained but was not fetched because the six-request budget was exhausted.

The video-card avatar collector returns no avatar for either first-page listing. The replacement's explicit `channelMetadataRenderer.externalId` and `avatar.thumbnails` provide two new valid channel/avatar associations, recorded in `expected_avatars.json`. The refresh learns them in the existing optional batch write. Missing, malformed or conflicting metadata does not discard videos or add a fallback request.

Uncompressed JSON response measurements:

| Channel | Baseline bytes / elapsed | Videos-tab bytes / elapsed | Byte increase |
| --- | --- | --- | --- |
| Linus Tech Tips | 396,353 / 517 ms | 437,063 / 357 ms | 10.3% |
| MrBeast | 395,065 / 731 ms | 433,417 / 978 ms | 9.7% |

These individual observations are not a latency benchmark. Production transport still uses its existing compression. Application request counts remain one RSS fetch and one browse request for the initial refresh; continuation, sorted/general listings and auto-generated channels retain their prior requests. No schema, API contract, refresh cadence, cache update policy or forced invalidation changes are introduced.

The reduced fixtures preserve every video card and its parsed metadata/identity, relevant duration and membership badges, sorting state, channel avatar and pagination structure. Menus, tracking, animation controls and playback data are removed. Live continuation tokens are replaced with `fixture-next-page`.

The frontend harness runs the actual refresh with local RSS fixtures and captured video writes, while using the real SQLite-backed optional avatar cache. It verifies 15 RSS videos per channel, single browse/RSS requests, one batch write, metadata precedence, malformed/conflicting/missing data, unchanged alternate paths and isolated cache failures. It then renders the actual Popular template and invokes the existing Popular API serializer with avatar-free ChannelVideo records to prove cache reuse. Browser checks cover both themes, mobile/desktop layouts and thin mode.

Verification passed: 42 targeted parser/avatar/comment examples, the frontend fixture harness, 26 relevant Chromium/Firefox checks, and a full production-source build with `crystal build src/invidious.cr -Dskip_videojs_download`. Crystal formatting, JavaScript syntax and patch whitespace checks also passed.

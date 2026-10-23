# Video view counts

Video cards, history, recommendations, clips and watch queues display counts
already available in the current response or the existing `videos` and
`channel_videos` caches. Missing counts remain hidden. Enrichment uses a batched,
read-only local lookup and never calls YouTube or refreshes video metadata.
There is no additional count storage or change to cache retention, so counts
can disappear after ordinary cache cleanup.

Video-containing API responses, including detailed history, playlist entries,
mix entries and a clip's nested source video, expose known counts as:

- `viewCount`: non-negative integer, including genuine zero.
- `viewCountPrecision`: `exact`, `approximate`, or `unknown` when a legacy cache
  contains a count without precision information.
- `viewCountType`: `views` for cumulative views or `watching` for concurrent viewers.
- `viewCountText`: localized display text using the same formatting as the website.

Existing numeric fields and response structures remain compatible. Existing
unknown-count sentinels retain `viewCountPrecision: "unknown"` without a
`viewCountType`; newly introduced count fields are omitted when unavailable.
An explicit `viewCountType` distinguishes a known legacy value with unknown
precision from a missing count. ID-only history responses stay unchanged.
Playlist-level aggregate statistics and clip-specific statistics are separate
from these per-video counts.

Valid response counts take precedence over cached data. For missing counts,
the newest usable cached observation wins. Ambiguous legacy live cache entries
are not relabelled as cumulative views. Abbreviated source counts remain marked
as approximate even when their numeric representation is an integer.

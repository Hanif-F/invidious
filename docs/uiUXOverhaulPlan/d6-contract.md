# D6 utility, editor and enhancement implementation contract

[Master plan](README.md) · [Tasks](tasks.md) · [Verification](verification.md) · [D5 acceptance](d5-acceptance.md)

D6 is locally accepted; see the [acceptance record](d6-acceptance.md). D7–D9 remain required. Transcript/comments are recorded in the [utility checkpoint](d6-utilities-checkpoint.md); replay/chat Settings are recorded in the [chat checkpoint](d6-chat-checkpoint.md). Clips are accepted in the [clip checkpoint](d6-clips-checkpoint.md). D5's historical evidence is preserved. The following work is
verified by the linked checkpoints and final runtime evidence; this inventory alone is not evidence.

| Workstream | Source owners | Required behavior and evidence |
| --- | --- | --- |
| Transcript | `transcript.js`, watch loader, `overhaul/watch_transcript.ecr` | One deliberate tab; language/search/seek/current line/Follow; independent empty/unavailable/error/retry; manual scroll retained; abort/generation/profile/cached-page ownership; no media recreation |
| Compact comments | Shared `comment-threads.js`, watch controller, server HTML, watch/post/community partials | YouTube/Reddit source/sort, compact readable threads, collapsed replies and explicit continuations; no duplicate handlers; native JSON unchanged; failures retain controls; same lifetimes as other readers |
| Replay panel | `live-chat.js`, `overhaul/watch_chat.ecr`, dedicated Settings | Synchronization/current-time return/filter/font/panel width/per-video offset; clear unavailable/failure distinction; remove browser overlay/opacity/geometry/movement/resizing code and UI; preserve native/API fields and raw stored values |
| Clip editor and library | Clip routes/templates, `clip-editor.js`, shared player/sync, clip listings | Utility-panel editor with existing media, 5–120-second bounds, consolidated controls, title/eligibility validation, literal failed drafts and public/immutable copy; preview restore and zero full-video progress pollution; standalone fallback; bounded playback/loop/attribution/owner deletion/unavailable source |
| Enhancements | Settings categories, dedicated channel/block/identity editors, contribution dialog, SponsorBlock/DeArrow/AI/masking scripts | One authoritative editor per setting, category Save/Discard, contextual shortcuts; inherited modes/colors; explicit safe contributions; identity isolation; filtering/masking/cache precedence and zero per-card metadata lookups |

The replay/editor workstream has a [detailed contract](d6-chat-contract.md). Clips follow the [clip contract](d6-clip-contract.md); the remaining editors and runtime interactions follow the [enhancement contract](d6-enhancements-contract.md).

Follow these workstreams in dependency order, reusing the shared controls and
lifecycle contracts. Native permissions/wire shapes, API-only recovery and raw
compatibility values must remain intact. Test actual Video.js media and guarded
PostgreSQL where relevant, then inspect light/dark desktop/RTL/error states. Do
not count a synthetic browser pass as live upstream or deployed-host verification.

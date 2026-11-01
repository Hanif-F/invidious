# D7 acceptance

[Master plan](README.md) · [Tasks](tasks.md) · [Coverage](coverage.md) · [Progress](progress.md)

**D7 is locally complete on 31 October 2026. D8–D9 remain required and the overall
overhaul goal is incomplete.** Its four checkpoints retain separate source,
check and visual evidence:

| Family | Implemented and verified behavior | Evidence |
| --- | --- | --- |
| Accounts, authorization and data | Shared ordinary forms, credential/session/token ownership, confidential failures, exact native expiry/callbacks, TV comparison/Approve/Deny, seven import sources, grouped exports and truthful partial-import results | [Account/data checkpoint](d7-account-data-checkpoint.md), [manifest](review/d7-account-data-evidence.json) |
| Administration, verification and recovery | Isolated admin access/defaults/policy, retained failed drafts, no-JavaScript recovery, explicit challenge Retry, native bridge confidentiality, early/iframe notices and API-only login/recovery | [Verification checkpoint](d7-verification-checkpoint.md), [manifest](review/d7-verification-evidence.json) |
| Legal, notices and errors | Accurate Privacy/storage/removal text, preserved licenses/LibreJS, readable known errors, private-safe diagnostics, legal GET/HEAD access, safe read recovery and no failed-write replay | [Reading checkpoint](d7-reading-checkpoint.md), [manifest](review/d7-reading-evidence.json) |
| Embeds | Minimal shared player, actual progressive/audio/DASH/HLS decode, exact context/cursors, cancellation/cached ownership, masking/keyboard/geometry and explicit required-login iframe recovery | [Embed checkpoint](d7-embed-checkpoint.md), [manifest](review/d7-embed-evidence.json) |

Every reachable D7 family now uses the shared design or the appropriate minimal
standalone shell. Direct/legacy entry points, existing ordinary forms and native
API contracts retain their authorization and data behavior. Security/destructive
actions remain deliberate and CSRF protected. Identity/session credentials do
not enter ordinary configuration, public reports or browser persistence.

The final embed checkpoint records resumed integration **106/106**, final
embedded/access/verification **46/46**, focused forced-color/watch/embed **4/4**,
shared actual-player/runtime **98/98**, boundary **68/68**, shell/Settings **10/10**
and relevant **43** spec examples. Overlapping phases are not a single summed
suite. Fresh production backend, normal/API-only type, fixture, format/syntax,
references/docs and whitespace checks pass with their stated phase boundaries.
Seven final embed views were inspected. Earlier checkpoint counts remain
historical evidence for their own source, rather than new full-suite claims.

D8 must still remove transitional shells/templates/assets/controllers, reconcile
the older frontend assertions, run the full repository verification matrix and
measure final assets/request behavior. D9 must finish the second semantic handbook
pass and requirements-to-evidence audit. The accepted D1 visual direction remains
the user's review checkpoint. No deployment, upstream smoke test or native-device
execution is claimed or required for this repository-local acceptance.

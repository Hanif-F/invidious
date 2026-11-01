# D6 replay and dedicated chat editor contract

[Master plan](README.md) · [D6 contract](d6-contract.md) · [Utility checkpoint](d6-utilities-checkpoint.md)

This workstream is accepted in the [chat checkpoint](d6-chat-checkpoint.md). D6 clips and enhancements and D7–D9 remain required.

The reader will own only replay acquisition, synchronization, bounded cache/DOM,
filter application and the selected utility panel. It will have no browser
overlay, player-child placement, opacity, move, resize or overlay geometry path.
The compatibility storage validator and native preference/API model retain the
existing raw overlay fields; saving browser settings must preserve those values.

One shared form/controller will serve the watch advanced settings entry and
`/preferences?section=chat`. Display and filters have one explicit Save/Discard
area. Per-video timing has its own clearly labeled Save/Discard area because its
endpoint and scope are independent. Failed drafts remain literal and recoverable;
no ambiguous write is automatically retried. Local persistence failure and partial
success must be truthful. Explicit read-back checks compare only the owned
fields. Native chat ranges remain 75–150 percent, 280–640 pixels, and per-video
±3,600 seconds; filters use the unchanged 1,024-byte server limit. Invalid regular
expressions remain editable without changing the previously applied filter.

For accounts, timestamps/user/word filters use the existing dedicated chat PATCH;
hide-user-ID/font/width remain profile-local. Guests save these browser values in
the existing profile-local chat store. Offset storage remains per video. No
identity or unrelated preference enters the form. No-JavaScript account forms can
save timestamps/filters; browser-only display and guest persistence require JS.

The native PATCH now merges the latest raw document instead of serializing a typed
model over it. Its response shape/field whitelist/limits stay compatible. Geometry
is checked against the latest values when geometry is actually patched. An
unrelated timestamp/filter patch must not normalize or reset historical geometry.
Known database conflicts may retry the raw merge; a lost HTTP response may not
trigger another write. Shared Settings navigation/search will include this
dedicated editor without putting chat into the general preference manifest.

Before acceptance: verify actual replay player seek/offset/return/filter/removal
and bounded history; deferred reads and page/profile/disposal ownership; failure
versus unavailable/empty; category Save/Discard/read-back/partial failures and
literal drafts; zero overlay UI/code; native/API limits and original raw values;
CSRF/profile/permission guards and real disposable PostgreSQL concurrency. Review
light/dark/RTL views and rerun affected earlier-stage checks.

## Accepted checkpoint

The cumulative desktop suite passes 172/172, QoL 28/28, and shared validators
15/15. Guarded local PostgreSQL checks, ordinary fixture verification, normal
and API-only type checks pass. Eleven current views were inspected, including
RTL regex direction, forced colors, field errors and the persistent dialog
header. See the [checkpoint](d6-chat-checkpoint.md) and
[source/check manifest](review/d6-chat-evidence.json) for scope and limitations.

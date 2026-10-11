# Data import and export

[Documentation index](README.md)

Signed-in users manage imports from `/data_control` and exports from supported subscription/data controls. API clients use the authenticated export/import and OPML routes. User exports are portable application data, not full database backups.

## Supported imports

| Input | Data supported | Implementation |
| --- | --- | --- |
| Invidious JSON | Subscriptions, watched IDs/details, preferences, chat offsets, positions and owned playlists | `User::Import.from_invidious` |
| YouTube subscriptions | Supported OPML/XML, JSON and CSV subscription exports | `from_youtube` |
| YouTube playlists | Supported CSV playlist exports | `from_youtube_pl` |
| YouTube history | Supported watch-history JSON | `from_youtube_wh` |
| FreeTube | Supported subscription records, parsed by the FreeTube importer | `from_freetube` |
| NewPipe subscriptions | Subscription JSON | `from_newpipe_subs` |
| NewPipe archive | Supported ZIP/SQLite backup data, including subscriptions/history | `from_newpipe` |

Exact format detection, MIME/extension handling and parsers live in [user/imports.cr](../src/invidious/user/imports.cr). These parsers implement known export formats; arbitrary/newer variants may not be compatible. NewPipe archives have an implementation size guard. Playlist imports may perform upstream fetches and skip unavailable videos, so timeouts and partial imports are possible.

Browser multipart field names are `import_invidious`, `import_youtube`, `import_youtube_pl`, `import_youtube_wh`, `import_freetube`, `import_newpipe_subscriptions`, `import_newpipe`. Send `csrf_token` as the **first multipart part**, or supply `X-CSRF-Token`, before any file is processed. Unsupported browser input can return 415. The page displays the supported upload choices.

## Invidious JSON export

`GET /api/v1/auth/export/invidious` serializes the fields below through [user/exports.cr](../src/invidious/user/exports.cr):

| Field | Content |
| --- | --- |
| `subscriptions` | Canonical channel IDs |
| `watch_history` | Compatible ordered watched-ID array |
| `watch_history_details` | Retained title/channel/date/duration metadata |
| `preferences` | Serialized effective account settings, including enhancement preferences |
| `chat_timing_offsets` | `{video_id, offset_ms}` records |
| `playback_positions` | `{video_id, position, updated_at}`; positions in seconds, timestamps in Unix seconds |
| `playlists` | Owned local playlists: title, plain description, privacy and video-ID sequence |

The export does **not** include passwords, browser sessions, API tokens, private feed credentials, encrypted DeArrow private identities, native clips, the standalone manual blocked-channel table or the saved-playlist bookmark table. Preference-based SponsorBlock channel overrides are included within preferences. Do not assume every account feature is recoverable from this JSON alone; full PostgreSQL plus secret backups are needed for complete instance recovery.

## Import semantics and verification

The Invidious importer merges/deduplicates subscriptions and watched IDs, imports compatible details, replaces supplied preference objects and creates playlists with new local IDs. Repeated playlist imports can create duplicates. It resolves subscription IDs and fetches available playlist videos; imports do not guarantee preservation of every unreachable source.

Positions are imported only when the resulting preferences enable `save_player_pos`; turning that preference off clears existing positions. Entries are validated for IDs, nonnegative positions and timestamps. Chat offsets are validated per record. Invalid detail fields can be ignored. Import is not one all-or-nothing account transaction: earlier supported sections may have been saved when a later section fails.

Legacy `POST /api/v1/auth/import/invidious` catches import exceptions and returns 204, so a 204 alone does not prove complete import success. Inspect the resulting subscriptions/history/preferences/playlists and retain the source export until checked. Browser import errors also do not imply earlier work was rolled back.

## Subscription exports

Authenticated `GET /api/v1/auth/subscriptions/export?format=rss` downloads `subscriptions.opml` with instance-oriented feeds. `format=newpipe` produces compatible source URLs. Browser subscription controls also expose supported JSON/OPML variants. The original README mentions FreeTube export compatibility through supported subscription formats; there is no separate full FreeTube account backup endpoint.

Private subscription RSS can be retrieved with `GET /api/v1/auth/feed/rss`, returning a token-bearing relative feed path. This credential is deliberately distinct from an ordinary subscription OPML file. Protect private feed URLs, exports and backups from shared caching and logs.

## Backup versus portability

JSON is suitable for moving the supported user data between instances. PostgreSQL backups preserve tables, ownership, clips, identities and caches; independent protected HMAC/DeArrow keys and deployment configuration are also needed. Use the offline restore procedure in [operations](operations.md) before migrations or recovery work. Replacing a secret is not equivalent to restoring it.

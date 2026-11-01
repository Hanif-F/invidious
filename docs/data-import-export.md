# Data import and export

[Documentation index](README.md)

Signed-in users manage imports from `/data_control` and exports from supported subscription/data controls. API clients use the authenticated export/import and OPML routes. The page groups portable JSON data separately from subscription OPML downloads and explains their scope and exclusions. User exports are portable application data, not full database backups.

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

Browser multipart field names are `import_invidious`, `import_youtube`, `import_youtube_pl`, `import_youtube_wh`, `import_freetube`, `import_newpipe_subscriptions`, `import_newpipe`. Send `csrf_token` as the **first multipart part**, or supply `X-CSRF-Token`, before any file is processed. Unsupported browser input can return 415. The browser page selects one source with an ordinary GET form, then displays its single existing upload field and format guidance. Source switching and upload work without JavaScript; changing the source does not submit a file. The optional duplicate-submit guard never automatically retries an import. When an importer rejects the source format, the form retains a private 415 response with the selected source, an empty file input and guidance that earlier parts may already have been saved. Other browser parser/import failures retain a 500 response and the source form with a generic message, without echoing uploaded contents or reporting them to a public issue page. Select the file again only after checking the result. Existing multi-field callers retain their multipart names and processing order.

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

The Invidious importer merges/deduplicates subscriptions and watched IDs, imports compatible details, replaces supplied preference objects and creates playlists with new local IDs. Every supplied watched ID must be an 11-character YouTube video ID; an invalid ID rejects the watched-ID section before it is saved. Repeated playlist imports can create duplicates. It resolves subscription IDs and fetches available playlist videos; imports do not guarantee preservation of every unreachable source.

Positions are imported only when the resulting preferences enable `save_player_pos`; turning that preference off clears existing positions. Entries are validated for IDs, nonnegative positions and timestamps. Chat offsets are validated per record. Invalid detail fields can be ignored. Import is not one all-or-nothing account transaction: earlier supported sections may have been saved when a later section fails.

`POST /api/v1/auth/import/invidious` returns 204 after successful import, 400 for invalid watched-video IDs, and 500 for other import failures. Individual unsupported or unreachable records may still be skipped by their import handlers. Inspect the resulting subscriptions/history/preferences/playlists and retain the source export until checked. API and browser import errors do not imply earlier sections were rolled back.

## Subscription exports

Authenticated `GET /api/v1/auth/subscriptions/export?format=rss` downloads `subscriptions.opml` with instance-oriented feeds. `format=newpipe` produces compatible source URLs. The browser export route `/subscription_manager?action_takeout=1` retains these formats: omitted/`rss` uses instance feeds, `newpipe` uses YouTube feeds, and `json` exports the full portable Invidious account data. It additionally accepts `opml` for FreeTube-compatible YouTube feeds and `newpipe_json` for NewPipe subscription JSON. All browser formats include attachment filenames and private cache headers. Every subscription is included even when its channel metadata is uncached; its ID supplies the fallback name. Full JSON exports preserve detailed history, playback positions, chat timing offsets and fork preferences. There is no separate full FreeTube account backup endpoint.

Private subscription RSS can be retrieved with `GET /api/v1/auth/feed/rss`, returning a token-bearing relative feed path. This credential is deliberately distinct from an ordinary subscription OPML file. Protect private feed URLs, exports and backups from shared caching and logs.

## Backup versus portability

JSON is suitable for moving the supported user data between instances. PostgreSQL backups preserve tables, ownership, clips, identities and caches; independent protected HMAC/DeArrow keys and deployment configuration are also needed. Use the offline restore procedure in [operations](operations.md) before migrations or recovery work. Replacing a secret is not equivalent to restoring it.

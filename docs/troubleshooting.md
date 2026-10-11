# Troubleshooting

[Documentation index](README.md)

Start with the exact HTTP status and an application log excerpt with credentials removed. Separate browser rendering, account/database state, companion extraction, media transport and optional enhancements; a failure in one does not establish a failure in every layer.

| Symptom | Check and next action |
| --- | --- |
| Config file missing | Run from installation root, set `INVIDIOUS_CONFIG_FILE`, or supply `INVIDIOUS_CONFIG`; individual overrides still need the initial YAML document |
| `CHANGE_ME!!`, missing HMAC or companion-key error | Replace placeholders; HMAC nonempty, companion key exactly 16 characters; ensure both endpoints use matching key |
| PostgreSQL connection failure | Database URL/role/password, reachability, PostgreSQL auth rules and dedicated DB existence; do not expose a password in pasted logs |
| Account schema needs migration | Stop all writers, back up, use new binary `--migrate`; `check_tables` is not the account-upgrade procedure |
| Username conflict during migration | Investigate case-insensitive duplicate legacy names in staging; migration abort is deliberate, not permission to delete accounts |
| Site loads but videos fail | Confirm companion configured/reachable/authenticated, then upstream extraction and media paths; home/stats liveness does not verify playback |
| Media works in metadata but fails in browser | Browser-reachable companion public URL, HTTPS/mixed content, CSP, selected codec, range requests and proxy forwarding |
| Download unavailable | Read catalog reason: server restrictions, restricted video ID, live/upcoming or no finite separate tracks |
| Selected download becomes 404 | Track metadata changed/expired; refresh catalog and let the user select again, rather than substituting another track |
| Captions/transcript/chat absent | Source availability and selectors; replay only for completed archives with replay metadata; test the corresponding API independently |
| Authentication 403 | Token expiry/revocation/signature/scope or missing browser CSRF; native auth middleware uses 403 even for expired tokens |
| Native login 401 | Incorrect credentials; account-management 401 may include `invalid_password`/`session_expired` code |
| New native feature denied | Existing tokens keep old scopes; sign out/in to receive the current native grant set |
| Repeated auth 429 behind proxy | Correct narrow `auth_trusted_proxies`, sanitized forwarding headers and Retry-After; without trust, all users can share the proxy limit |
| Multipart import CSRF failure | CSRF must be first part or supplied in header before files; fetch a fresh session token |
| Import returns 204 but data missing | Legacy API catches exceptions/partial failures; compare resulting collections, validate format, inspect upstream skips and retain export |
| Private playlist returns 404 | Authenticate as owner; public path possession does not override privacy; bearer clients should use authenticated API/feed variants |
| Theme toggle or playlist subscription GET fails | These mutations are POST with appropriate CSRF |
| Subscription feed stale/empty | Channel/feed jobs enabled, job backoff, materialized views and upstream upload metadata; direct channel tab results use a different fetch path |
| SSE notifications delayed | Notification endpoint enabled, proxy buffering/timeouts/caching, stream ownership/reconnect, channel refresh pipeline |
| History/position write 409 | Check watch_history/save_player_pos opt-in; disabled position saving clears stored account positions |
| Resume behind the last played position | Compare last acknowledged save; page unload/OS termination can prevent background delivery |
| Progress bars absent | Known positive duration, positions/watch state and correct profile; unknown durations intentionally have no partial bar |
| DeArrow original title remains | Opt-in, JavaScript/viewport loading, trusted available title/cache; null is the ordinary fallback |
| DeArrow contributions disabled | Migration 13/table and persistent 64-hex dedicated key; malformed/missing key disables contribution identity use |
| Existing DeArrow identity unreadable | Restore original key; do not auto-reset or replace private identities; use explicit re-encryption procedure for planned rotation |
| SponsorBlock does nothing | Master/category/channel override, nonlive source and available segments; missing/upstream failure is an empty list |
| AI filter leaves a matching channel visible | Relevant action/master, list availability, canonical identity/handle resolution; unresolved/saturated requests remain visible |
| AI library action cannot hide | Library/channel/queue surfaces deliberately support replacement only |
| Filtered search page empty with pagination | Upstream count is retained; local hiding can remove every card on that page |
| Member-video toggle does not unlock video | Visibility preference is not membership authorization |
| Account switch leaves stale UI | Profile markers/storage guard should stop/reload stale tabs; inspect storage-denial warnings and avoid unscoped custom scripts |
| Browser setting does not survive reload | Storage denied/full, cookie limits, current profile or intentionally page-only temporary state; UI should report persistence failure |
| Avatar missing | Missing cached/observed URL intentionally renders placeholder; no extra avatar-only metadata request is made |
| Old JS/CSS after deploy | Correct asset commit/build, process restart and deployment cache identity; static assets have long cache lifetime |
| `--migrate` cannot find SQL | Working directory/config SQL runtime files; binary alone is not a complete installation |
| Unix socket fails | Parent directory exists, service user permissions and quoted octal mode; configured path must not be a directory |
| Builds fail fetching player dependencies | Network/package availability or prefetch pinned assets and use skip flag; skip alone does not supply missing runtime assets |
| Specs fail on missing mocks | Initialize the `mocks` Git submodule |
| Browser tests cannot load fixture media | Render fixtures, generate both synthetic FFmpeg media files and install selected Playwright engines |

Use [development](development.md) to select focused checks and [operations](operations.md) for backup/restore. Avoid clearing all user data or changing persistent secrets as a generic troubleshooting step; those actions can destroy recoverable state without fixing the underlying upstream/proxy problem.

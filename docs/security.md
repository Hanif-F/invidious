# Authentication, privacy and security behavior

[Documentation index](README.md)

This guide documents implemented controls and operator boundaries. It does not certify an uninspected deployment. [ACCOUNT_SECURITY.md](../ACCOUNT_SECURITY.md) retains the account-upgrade procedure and [SECURITY_READINESS.md](../SECURITY_READINESS.md) retains the earlier release review/results.

## Credentials and identity

New passwords use bcrypt cost 12 and credential version 2. Validation requires 15 characters–72 UTF-8 bytes, no NUL, at least four distinct characters and absence from the bundled common-password list. Legacy version 1 preserves its 55-byte verification behavior. Invalid/missing users perform dummy verification to reduce simple timing differences.

Username uniqueness is case-insensitive. Immutable random owner IDs live in the legacy `email` column, independently of mutable usernames. Rename/password change verifies current credentials and session under a row lock, revokes all old sessions/tokens and creates replacement credentials. No email recovery is implemented. SQL ownership is not inferred from a client-supplied username/profile marker.

## Browser cookies and CSRF

`SID` is HttpOnly, SameSite=Lax, path `/`, expires after 30 days and is Secure for configured HTTPS except the implementation's I2P domain exception. `PREFS` is intentionally JavaScript-readable, SameSite=Lax and normally two years. Cookie-domain choice uses the canonical domain or explicitly permitted alternative forwarded host. Correct public HTTPS configuration is required for expected Secure behavior.

Login/signup forms use a fresh HttpOnly `AUTH_CSRF` binding and signed one-hour action token. Authenticated HTML forms use session-bound signed action tokens. Cookie-authenticated API POST/PUT/PATCH/DELETE requires CSRF; `GET /api/v1/auth/csrf` issues a one-hour token sent in `X-CSRF-Token`. Multipart imports validate before processing files; put CSRF first or use the header.

Playlist subscription and color-mode toggle are POST actions. Old mutating GET links/scripts need updating. Bearer-only clients use validated scopes/signatures and do not need browser CSRF. Bearer authentication wins when an unrelated SID cookie is also supplied.

## API tokens and administration

Tokens are signed JSON containing session/scopes/optional expiry/signature, with a server-side session record. They are not JWTs or browser SIDs. `v1:` token sessions cannot be passed as ordinary SID cookies. Revocation checks the authenticated owner; token lists omit browser session credentials. Generic child issuance cannot exceed the parent scopes.

Native login grants a defined 30-day capability set. It deliberately excludes generic token listing/minting and account export/import. Dedicated native account/session/token-management routes require their own scopes, and sensitive credential/token issuance operations require password confirmation. Profile IDs and `X-Invidious-Account-Profile` are storage metadata, not credentials.

`login_required` optionally gates all dynamic content before bot protection or
route execution. Browser sessions and API/media bearer tokens must have a live
database session; bearer signature/expiry checks also apply. Supplied invalid
bearer credentials never fall back to cookies. Ordinary content access does not
require new token scopes, while account endpoints still enforce existing scopes,
ownership and CSRF. Form tokens cannot serve as general access credentials.
Passing the instance gate does not publish bearer account identity on public API
routes; private playlists remain available through the scoped authenticated APIs.
Anonymous pages redirect to login; API/media failures return no-store HTTP 401
JSON with `error: "login_required"` and `loginUrl`. See
[configuration](configuration.md#private-instances-and-whitelist-access) for
bootstrap and signed-integration exceptions and the Companion deployment boundary.
Bot verification remains independent of account login; see
[bot protection](bot-protection.md) and its [deployment checks](bot-protection-rollout.md).

## Throttling and proxies

Authentication is limited by shared PostgreSQL windows: 10 attempts per username and 100 per IP per 15 minutes, plus 10 signup attempts per IP per hour. Attempts include successful authentication. CAPTCHA challenge issuance has its own native limit. HTTP 429 includes Retry-After; there is no permanent account lockout.

`auth_trusted_proxies` defaults empty. Only a trusted direct peer enables forwarded-chain inspection; traversal stops at the first untrusted address, and malformed chains fall back to the direct peer. Configure actual proxy CIDRs and sanitize forwarding headers at the edge. Otherwise proxied users share the proxy IP limit. This is account throttling, not a complete bandwidth/resource abuse control.

## Resource privacy and caching

Private local playlists require owner authorization across pages, API, embeds, indexed series and redirects. Public/unlisted accessibility does not grant edit rights. Clip deletion, block management, positions/history and session revocation are account-scoped. Account deletion removes owned playlists/videos transactionally; declared foreign keys cascade newer account tables.

Responses carrying SID/PREFS/Authorization and private feeds receive no-store context, and authenticated API responses/errors are `private, no-store`. Some transient public handlers also set no-store. Configure proxy/CDN bypass for authenticated/personalized requests and respect response headers. Test the same private URL as two users and anonymously through the real cache; local application tests cannot establish external cache policy.

With required login enabled, dynamic responses enforce `private, no-store` and
vary on Cookie/Authorization even when a streaming upstream supplies cache
headers. Browser account cookies, Authorization and CSRF headers are removed from
outbound Companion proxy requests.

## Browser and network protections

Request context sets CSP, nosniff, same-origin referrer policy and frame restrictions. Ordinary pages disallow framing; `/embed/*` intentionally allows embedding. Script sources are same-origin; styles currently allow inline styling. CSP additionally admits configured companion origins and direct Google media when relevant. HSTS is emitted for HTTPS when enabled and includes subdomains/preload.

Media proxy hosts and redirects are validated against permitted complete Google media hosts and HTTPS destinations, rejecting credentials/fragments/nonstandard ports. Download selectors resolve only server-generated local media/companion paths and never accept a caller redirect destination. These checks do not eliminate the need to isolate PostgreSQL/private companion ports and bound public proxy traffic.

## Secrets, logs and external data

HMAC signs sessions/actions and derives shared throttle/browser-profile identifiers. Keep it stable and shared across database-sharing instances. DeArrow has a dedicated persistent encryption key, with account-bound encrypt-then-MAC ciphertext and separately derived encryption/authentication keys. An operator possessing both database and key can decrypt identities; database-only exposure lacks the key. Never print/import/export private IDs through ordinary preference JSON.

The request logger omits queries and redacts webhook credential paths. Reverse-proxy/CDN/telemetry redaction is separate. Private feed URLs, tokens, upstream cookies, exports and backups remain sensitive. Optional services receive their documented request data; direct media delivery can expose the browser IP to the selected upstream host. [Integrations](integrations.md) describes each boundary.

For tests and deployment verification, use [development](development.md) and the guarded disposable database harnesses. Historical advisory/validation statements in root security files should not be interpreted as current scans of every deployed dependency.

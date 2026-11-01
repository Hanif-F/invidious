# DeArrow title contributions

On the watch page, **More → Suggest / vote on titles** opens the signed-in contribution dialog, independently of the title-replacement preference. Its assets load on demand. Clicking a vote sends it; suggesting a title requires Review, all four guideline acknowledgements and Submit. The close header stays visible while the body scrolls. Title suggestions and voting require JavaScript; identity management also has an ordinary account form. Desktop browser verification is described below. No extension license key is needed. Only intentional actions create submissions or votes.

## Instance setup

Apply database migration 13 (the normal migration runner), or use the updated fresh-install SQL. Configure `dearrow_identity_key` with a dedicated, persistent 64-character hexadecimal secret, generated with `openssl rand -hex 32`. The equivalent environment variable is `INVIDIOUS_DEARROW_IDENTITY_KEY`. Keep it outside source control. Restart the instance after configuration. An empty or malformed key disables contributions and displays an administrator-setup explanation; reading replacement titles continues to work.

Back up this key separately from the database. Losing or changing it makes existing private identities unreadable. Do not rotate it by simply replacing the configuration value. For planned rotation, stop contribution writes, decrypt and re-encrypt each `dearrow_identities.ciphertext` with `Invidious::DeArrow::IdentityCipher.open`/`.seal` using the same account email and the old/new keys, transactionally update the rows, replace the configured key, and restart all workers. Keep the old key and backup until the migration is verified. Never print decrypted IDs. This intentionally has no automatic identity-reset fallback.

Private identities use AES-256-CBC encryption with a fresh random IV and encrypt-then-HMAC-SHA256 authentication. Encryption and authentication keys are derived separately; the authenticated payload includes the account email and format version. Ciphertexts are isolated from preferences and deleted with their account. Encryption protects database-only exposure; an operator with both the database and instance key can decrypt identities.

## Account preferences

An account receives a random private DeArrow ID on its first contribution. **Settings → DeArrow → Contribution identity** opens `/preferences/dearrow/identity` for importing an existing **private user ID**. Replacing a stored identity requires explicit confirmation; stale web imports cannot overwrite a newer native/web import. The private ID differs from a public user ID, display name or extension license key. The import field is never prefilled, and older blank submissions preserve the current identity. IDs are never included in ordinary preferences, exports, page configuration, cookies or response bodies. Importing an ID does not import vote history or change previously submitted votes.

## Interfaces and behavior

- Existing `GET /api/v1/dearrow/:id` still returns the trusted replacement title.
- Signed-in `GET /api/v1/dearrow/:id/submissions` returns `{titles: [{title, original, votes, locked, UUID}]}` in upstream order, including untrusted proposals. This response is not cached by the browser.
- Session-authenticated, CSRF-protected `POST /dearrow_submit` accepts URL-encoded `video_id`, `action` (`submit`, `upvote`, `downvote`) and `csrf_token`. The browser additionally sends its opaque `browser_profile`; older callers may omit it. A new title includes `title` (1–110 characters) and `confirmed=true`; votes identify an upstream `uuid` or `original=true`. The server resolves titles and identities, and returns `{ok:true}` or `{error:...}` with an appropriate status. Web forms are bounded to 8192 bytes.
- `POST /dearrow_identity` accepts a private ID and CSRF token through the dedicated identity form; successful saves redirect to `/preferences/dearrow/identity`. The API never returns the ID.

Mobivious uses the bearer-authenticated `/api/v1/auth/dearrow` endpoints documented
in [the native API contract](mobile-api.md#native-dearrow-contributions). The web
forms and native API share validation, upstream title resolution and encrypted
identity storage. Native identity status reports only storage readiness and whether
an identity exists. Private IDs are submitted only in a dedicated import request,
never in ordinary preferences or title reads. Existing native tokens need a new
sign-in to obtain the DeArrow permissions. Native payloads/scopes remain compatible.

All upstream requests go to the fixed SponsorBlock host. Reads use a four-character video hash prefix and `fetchAll=true`. Contributions send only title data, use `Invidious/<version>` as the client identifier and disable VIP auto-lock. The UI disables downvotes for locked submissions and for an original title without an upstream record. Upstream moderation remains authoritative. A success means the upstream accepted the request, not that a title will immediately replace the original. Votes cast elsewhere are not presented as locally known vote state.

Failures retain the literal draft and reviewed acknowledgements in the same live page. Returning from Review to edit requires fresh acknowledgements. A confirmed rejection allows an explicit retry. A timeout, network failure, malformed acknowledgement or server failure may follow an accepted write: the dialog blocks both vote directions for that target, or the same trimmed title proposal, for the rest of that page's lifetime. Closing/reopening or refreshing submissions does not clear that protection. Reading rankings cannot confirm a personal vote. No write is automatically retried. After a confirmed write, a failed list refresh reports that the action was accepted and offers the ordinary explicit refresh.

Channel title masking also covers contribution rows and generic vote labels. **Show titles in this dialog** is an explicit, temporary reveal and resets when the dialog closes; it does not change the watch title cycle. Loading and writes are cancelled on page/profile/disposal changes, and late responses cannot update a different lifetime. Closing retains a same-profile draft. No private submitter IDs are requested in read responses. Server winning-title caches are invalidated after a successful contribution; upstream rankings can take time to refresh.

## Verification

Run `crystal spec spec/dearrow_spec.cr spec/dearrow_contributions_spec.cr`, render the frontend fixtures, then run `node --test --test-name-pattern='D6 contribution|D6 unknown vote|D6 unknown title|D6 rejected contribution|D6 late contribution|D6 bounded contribution' tests/frontend/overhaul.test.cjs`. Chromium/Firefox checks cover asset failures/timeouts, read states, exact Unicode proposals, renewed consent, known/unknown outcomes, lifetime races, masking, keyboard focus, actual media continuity and Light/Dark/enlarged RTL desktop geometry. The guarded disposable PostgreSQL account harness's `--settings-only` mode verifies production web routes, profile/CSRF/roles, exact resolution, private identity isolation, conditional imports and one-attempt transport failures. All browser/upstream writes are intercepted; no real votes are sent. Physical native clients and mobile website layout are outside this desktop checkpoint.

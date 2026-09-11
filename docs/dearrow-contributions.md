# DeArrow title contributions

The watch page offers a title suggestion and voting dialog for signed-in users, independently of the title-replacement preference. Votes are sent immediately; new titles require explicit acknowledgement of all four guidelines. The dialog supports keyboard navigation and narrow touch screens. No license key is needed: the [DeArrow API](https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow) is free for non-extension clients. Only intentional user actions create submissions or votes.

## Instance setup

Apply database migration 13 (the normal migration runner), or use the updated fresh-install SQL. Configure `dearrow_identity_key` with a dedicated, persistent 64-character hexadecimal secret, generated with `openssl rand -hex 32`. The equivalent environment variable is `INVIDIOUS_DEARROW_IDENTITY_KEY`. Keep it outside source control. Restart the instance after configuration. An empty or malformed key disables contributions and displays an administrator-setup explanation; reading replacement titles continues to work.

Back up this key separately from the database. Losing or changing it makes existing private identities unreadable. Do not rotate it by simply replacing the configuration value. For planned rotation, stop contribution writes, decrypt and re-encrypt each `dearrow_identities.ciphertext` with `Invidious::DeArrow::IdentityCipher.open`/`.seal` using the same account email and the old/new keys, transactionally update the rows, replace the configured key, and restart all workers. Keep the old key and backup until the migration is verified. Never print decrypted IDs. This intentionally has no automatic identity-reset fallback.

Private identities use AES-256-CBC encryption with a fresh random IV and encrypt-then-HMAC-SHA256 authentication. Encryption and authentication keys are derived separately; the authenticated payload includes the account email and format version. Ciphertexts are isolated from preferences and deleted with their account. Encryption protects database-only exposure; an operator with both the database and instance key can decrypt identities.

## Account preferences

An account receives a random private DeArrow ID on its first contribution. Preferences → Content also allows importing an existing **private user ID**, which replaces the account's contribution identity. It is distinct from a public user ID, display name, or extension license key. The import field is never prefilled; blank submissions preserve the current identity. IDs are never included in ordinary preferences, exports, page configuration, cookies, or response bodies. Importing an ID does not import vote history or change previously submitted votes.

## Interfaces and behavior

- Existing `GET /api/v1/dearrow/:id` still returns the trusted replacement title.
- Signed-in `GET /api/v1/dearrow/:id/submissions` returns `{titles: [{title, original, votes, locked, UUID}]}` in upstream order, including untrusted proposals. This response is not cached by the browser.
- Session-authenticated, CSRF-protected `POST /dearrow_submit` accepts URL-encoded `video_id`, `action` (`submit`, `upvote`, `downvote`), and `csrf_token`. A new title includes `title` (1–110 characters) and `confirmed=true`; votes identify an upstream `uuid` or `original=true`. The server resolves titles and identities, and returns `{ok:true}` or `{error:...}` with an appropriate status.
- `POST /dearrow_identity` accepts a private ID and CSRF token through a dedicated Preferences form; successful saves redirect back to Preferences. The API never returns the ID.

All upstream requests go to the fixed SponsorBlock host. Reads use a four-character video hash prefix and `fetchAll=true`. Contributions send only title data, use `Invidious/<version>` as the client identifier and disable VIP auto-lock. The UI disables downvotes for locked submissions and for an original title without an upstream record. Upstream moderation remains authoritative. A success means the upstream accepted the request, not that a title will immediately replace the original. Votes cast elsewhere are not presented as locally known vote state.

Failures preserve a title draft. Write requests are never automatically retried because a timeout can follow an accepted submission. The local winning-title cache is invalidated after a successful contribution, but upstream rankings can take time to refresh. No private submitter IDs are requested in read responses.

## Verification

Run `crystal spec spec/dearrow_spec.cr spec/dearrow_contributions_spec.cr`, render the frontend fixtures, then run the frontend browser tests. The fixture renderer includes identity persistence/import, rejection of unsigned or invalid-CSRF writes, upstream title resolution, and cascading account deletion using SQLite. Browser tests intercept all upstream writes; they do not submit real votes. Mobile tests cover 320px and 390px widths and a reduced viewport height to check scrolling while the keyboard occupies screen space; physical iOS/Android keyboard behavior still needs device verification.

Original-title cache tests require an **empty** database named
`invidious_original_titles_test`:

```sh
ORIGINAL_TITLES_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_original_titles_test crystal run tests/database/original_video_titles.cr
```

The guarded harness checks migration 24, durable positive/negative entries, expiry,
memory fallback during cache outages and idempotent fresh-install SQL. The account
harness also checks native PATCH ↔ web form title-preference synchronization,
strict types, sparse preservation and account isolation. Destroy test databases
after use.

Run the block-list integration checks against a disposable PostgreSQL database named `invidious_blocking_test`:

```sh
BLOCKING_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_blocking_test crystal run tests/database/blocked_channels.cr
```

The test refuses any other database name. It creates tables, tests migration tracking, per-account isolation, repeated block/unblock operations, cascade cleanup, and the fresh-install SQL. It also runs `playback_positions.cr` against both migrated and fresh-install schemas, checking progress imports, stale updates, retention, pruning, and account deletion. Destroy the disposable database after the run.

AiSList cache migration and persistence checks use a separate disposable database:

```sh
AI_SLIST_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_ai_slist_test crystal run tests/database/ai_slist.cr
```

This verifies migration 22, fresh-install schemas, independent persisted lists,
offline recovery, stale status, newer handle observations, and negative caching.

DeArrow identity storage has a separate disposable PostgreSQL check:

```sh
DEARROW_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_dearrow_test crystal run tests/database/dearrow_identities.cr
```

It verifies migration 13 and fresh-install SQL, simultaneous first-use identity creation, imports, account isolation, and cascading deletion. The database name is enforced before writes.

History integration checks require a disposable database named `invidious_history_test`:

```sh
HISTORY_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_history_test crystal run tests/database/watch_history.cr
```

This checks migrations 14/16 and the fresh schema, account dates, repeat/concurrent watches, archived dates, missing metadata, cache backfill and eviction, video duration recovery/preservation, old and invalid duration imports, import/export, and cascading account deletion.

Account security checks use an **empty** disposable database named
`invidious_accounts_test`:

```sh
ACCOUNT_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_accounts_test crystal run tests/database/accounts.cr
```

This runs the production migration, database services, and account routes. It checks
legacy credentials and linked-data preservation, concurrent signup and credential
changes, failed signup rollback, browser/API session behavior, throttling, CSRF,
nonce consumption, cookies, form rendering, migration conflict rollback and fresh SQL.
The harness validates the database name and emptiness before writing, and recreates
its public schema to test rollback and fresh installation. Destroy it after use.

The account harness also runs `security_checks.cr` against production middleware
and routes. It covers private playlist embeds, API/browser identity precedence,
restricted-token listings, cross-user revocation, CSRF-protected API/forms/imports,
cache headers, log redaction and playlist deletion/rollback with two users.

Native clip storage and route checks use an **empty** disposable PostgreSQL
database named `invidious_clips_test`:

```sh
CLIPS_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_clips_test crystal run tests/database/clips.cr
```

The harness checks migration 19, public and account listings, creation, CSRF,
token scopes, cross-account deletion, username attribution, immutable playback
bounds, cache eviction, pagination, account cleanup, and the fresh schema.
Remove the disposable database after testing.

`playlist_rss_checks.cr` is included in the account harness. It tests migration 20
backfill/preservation, concurrent and independent subscriptions, caller-only legacy
cleanup, live source metadata, cached fallback, ownership/privacy flags, CSRF and
native scopes, private Atom authorization, empty/populated Atom namespaces, seeded
mix snapshots, complete OPML (165 subscriptions with an uncached ID), account
cascades and rendered English category headings with their existing counts.

Avatar cache checks use an **empty** disposable database named `invidious_avatars_test`:

```sh
AVATAR_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_avatars_test crystal run tests/database/channel_avatars.cr
```

These verify migration 21 and fresh-install SQL, batched persistence, old-cache reuse,
newer/concurrent observations, invalid URLs, database failure fallback, and isolation
from the subscription crawler. Remove the disposable database after testing.

`account_management_checks.cr` also runs in the account harness through production
middleware. It checks native registration availability/duplicates and atomic
rollback, single-use endpoint-bound CAPTCHA (including expired/web challenges),
password typos without session loss, replacement credential sessions, concurrent
old-password login races, internal identity/subscription preservation, opaque
browser/API metadata, cross-account revocation rejection, current-session
revocation, selected token scopes and malformed expiry, delegated permission
limits, and password-confirmed deletion. Native signup issues no browser cookie
or extra session. These additions reuse the existing account/session schema.

`subscription_manager_checks.cr` runs in the same account harness. It verifies
read-only channel/history cache queries, distinct viewing counts, account timezone
and 90-day decay, unwatched-upload freshness at seven days, future/premiere/member
filtering, account isolation, browser sort persistence, OPML export and unsubscribe.
Ranking and malformed-cookie cases also have focused Crystal specs; the frontend
harness checks the production manager at mobile widths, in RTL and without JavaScript.

The same account harness exercises optional native `include_stats=true` responses
through production auth middleware: ordinary response compatibility, existing
subscription/history scopes, permission denials, shared-score equality,
cross-account isolation, private/no-store headers, untouched browser preferences
and read-only history. Native tokens need no new scopes or renewal.

`mobile_checks.cr` exercises every `seek_seconds` value through production bearer
PATCH, unrelated sparse PATCH, older browser forms, current browser forms and
native GET. It verifies strict integer validation, atomic invalid-patch rejection
and isolation from other accounts, using existing preference scopes and schema.

`upstream_merge_checks.cr` runs in the same guarded account harness. It checks
portable-import video-ID validation and error statuses, detailed-history/progress
and audio/seek preference preservation, plus parameterized subscription filtering
for empty, populated and malformed legacy watched arrays and paginated results.

`required_login_checks.cr` exercises the production login gate, bot/auth middleware,
static assets and account routes. It covers default-off behavior, all-method
anonymous blocking before upstream work, redirects and safe return queries,
browser/native credential expiry and revocation, bearer precedence, scope/CSRF
isolation, streaming cache headers, credential filtering, web/mobile signup and
whitelist mode, signed RSS/webhooks, TV bootstrap, environment settings and admin
persistence. Admin-save tests use a temporary config directory, never the live
instance configuration. The harness requires no running Invidious server.
Use the same guarded empty database with `--required-login-only` to run just this
suite after applying the normal migrations.

`browser_profile_checks.cr` runs in the account harness through production middleware.
The native account-management checks also verify mobile `profileId` and preference
response metadata, unchanged browser identity, stable profiles through credential
changes, and different identities when a deleted username is reused.
It covers opaque stable account identifiers, account defaults versus guest preferences,
browser signup defaults, preserved guest cookies across sign-in/sign-out, scoped search
and sorting, revoked sessions, account rename, current-profile response headers,
unchanged native bearer behavior, rejected guest channel writes and account-only
deletion cleanup. It reuses the existing schema; no browser-profile migration is needed.

The account harness also runs `ai_native_checks.cr`: public classification/status
routes through production middleware, bounded input validation, legacy AI action
canonicalization, concurrent sparse preference edits, unrelated-field retention,
atomic rejection and browser CSRF. Classification uses synthetic lists and fake
channel resolution; no YouTube or GitHub request is permitted. Focused parser/API
specs run with `crystal spec spec/ai_slist_spec.cr spec/ai_slist_api_spec.cr spec/native_preferences_spec.cr`.

`tv_pairing_checks.cr` runs in the account harness through production middleware, templates and registered HTTP routes. It verifies migration 23/fresh SQL, hashed codes, polling slowdown, states/expiry/cleanup, CSRF/account binding, IP/account limits, two concurrent redemptions, issuance rollback, session/credential revocation and deletion. A local HTTP flow follows browser login/approval through native token authentication. No deployed QR acceptance is implied. `PAIRING_PREVIEW_DIR` optionally saves the synthetic approval HTML with all CSRF values replaced. API-only preflight is separately checked with `crystal run tests/tv_pairing_api_only.cr -Dapi_only`, without a database.

Turnstile protection uses an isolated **empty** database named
`invidious_bot_protection_test` (the harness refuses other names and resets its
schema). It mocks Siteverify and never contacts YouTube or Cloudflare:

```sh
BOT_PROTECTION_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_bot_protection_test crystal run tests/database/bot_protection.cr
BOT_PROTECTION_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_bot_protection_test crystal run tests/database/bot_protection.cr -Dapi_only
crystal run tests/frontend/render_fixtures.cr
cd tests/frontend && node --test bot-protection.test.cjs
```

The browser checks use Playwright Chromium, test retry/native events/cookies and
playback/iframe recovery. Use Cloudflare test keys in a separate manual browser
smoke environment before production activation; production hostname/action checks
remain strict and are never relaxed for test keys. A real Companion deployment
must separately be checked for public ports or alternate routes.

Optional live widget smoke (uses the published always-pass Cloudflare sitekey,
with a mocked instance exchange and no production credentials):

```sh
cd tests/frontend && node turnstile-provider-smoke.cjs
```

This checks that the real widget loads under the verification-page CSP and emits
the native completion event. It does not replace a production hostname/key and
playback smoke before activation.

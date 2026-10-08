Run the block-list integration checks against a disposable PostgreSQL database named `invidious_blocking_test`:

```sh
BLOCKING_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_blocking_test crystal run tests/database/blocked_channels.cr
```

The test refuses any other database name. It creates tables, tests migration tracking, per-account isolation, repeated block/unblock operations, cascade cleanup, and the fresh-install SQL. It also runs `playback_positions.cr` against both migrated and fresh-install schemas, checking progress imports, stale updates, retention, pruning, and account deletion. Destroy the disposable database after the run.

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

`browser_profile_checks.cr` runs in the account harness through production middleware.
The native account-management checks also verify mobile `profileId` and preference
response metadata, unchanged browser identity, stable profiles through credential
changes, and different identities when a deleted username is reused.
It covers opaque stable account identifiers, account defaults versus guest preferences,
browser signup defaults, preserved guest cookies across sign-in/sign-out, scoped search
and sorting, revoked sessions, account rename, current-profile response headers,
unchanged native bearer behavior, rejected guest channel writes and account-only
deletion cleanup. It reuses the existing schema; no browser-profile migration is needed.

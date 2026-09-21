# Account upgrade and recovery procedure

This release separates `/login` and `/signup` and adds private `/account` settings.
`/change_password` remains supported. Login POSTs no longer create accounts.
Forms require fresh cookie-bound CSRF tokens; legacy scripts must update their flow.

Existing names and password hashes are preserved. The old `users.email` value
remains the immutable owner ID, not a contact address. Migration 17 copies it to
`username`; new accounts use random owner IDs. Renames update displayed names,
not ownership. Legacy bcrypt hashes retain their 55-byte verification behavior.
New passwords use version 2, bcrypt cost 12, and 15 characters–72 UTF-8 bytes.
Passwords are never checked against an external service. The bundled blocklist
and its license are in `config/security/`.

Browser sessions expire after 30 days; existing browser sessions get 30 days
from migration. API tokens keep their existing expiration rules. Changing either
credential revokes all sessions and API tokens and creates a fresh browser session.
There is no email recovery or forced password reset in this release.

## Deploy with an offline backup

1. Schedule a maintenance window. Stop **all** application instances and workers
   that write to the database; do not run old and new versions together.
2. With the deployment's PostgreSQL connection configured as `DATABASE_URL`, save
   an external backup: `pg_dump --format=custom --file=before-account-upgrade.dump "$DATABASE_URL"`.
   Protect the dump as sensitive data and retain the previous application release
   and configuration, especially its HMAC key.
3. Restore that dump into a separate empty staging database using
   `pg_restore --exit-on-error --no-owner --dbname="$STAGING_DATABASE_URL" before-account-upgrade.dump`.
   Point an isolated new-release configuration at staging and run
   `./invidious --migrate`. Check existing login, settings, subscriptions, history,
   playlist ownership and API access there before proceeding.
4. With production still stopped and the new binary configured for production,
   run `./invidious --migrate`. Migration 17 is transactional and records completion;
   rerunning the migrator skips it. Unexpected username conflicts abort without
   account changes. Investigate the conflicting data; never delete/merge accounts
   merely to make migration pass.
5. Start the new release and confirm old credentials work. Check signup, a test
   account rename, password changes and session revocation. Monitor authentication
   errors, HTTP 429s, and database errors without logging credentials or tokens.

If migration fails, keep the application stopped while investigating. If rollback
is necessary, restore the backup into a **new empty database**, verify it, then
point the previous release at that database. Do not run the previous release's
schema checker against the upgraded database. Restoring the backup discards writes
made after it; retain the upgraded database for reconciliation if traffic resumed.

## Reverse proxies and throttling

`auth_trusted_proxies` is an empty list by default. Set only actual proxy CIDRs,
for example `["127.0.0.1/32", "::1/128"]` for a local proxy. The application walks
X-Forwarded-For from the trusted peer backwards to the first untrusted address.
Malformed chains fall back to the direct peer. Without configuration, proxied
clients share the proxy's IP limit. Configure public HTTPS and `https_only` as usual.

PostgreSQL stores HMAC-derived throttle keys shared by all instances. Limits are
10 authentication attempts per username and 100 per IP per 15 minutes, and 10 signup
attempts per IP per hour. Windows expire automatically; HTTP 429 includes Retry-After.
Attempts include successful authentication; there is no permanent account lockout.
Keep the same HMAC key across instances.

## Automated verification

Run `crystal spec`, normal and `-Dapi_only` builds, and formatting checks.
Run the production database/route integration harness against an **empty disposable**
database whose name must be `invidious_accounts_test`:

```
ACCOUNT_TEST_DATABASE_URL=postgres://postgres:password@localhost/invidious_accounts_test crystal run tests/database/accounts.cr
```

The harness writes test accounts and schemas; never point it at production.
It checks legacy migration, linked data preservation, case-insensitive collisions,
transaction rollback, password/session changes, throttling, CSRF, cookies and forms.
Destroy the disposable database after the run.

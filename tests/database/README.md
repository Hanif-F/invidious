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

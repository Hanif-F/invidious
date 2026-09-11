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

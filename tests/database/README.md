Run the block-list integration checks against a disposable PostgreSQL database named `invidious_blocking_test`:

```sh
BLOCKING_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_blocking_test crystal run tests/database/blocked_channels.cr
```

The test refuses any other database name. It creates tables, tests migration tracking, per-account isolation, repeated block/unblock operations, cascade cleanup, and the fresh-install SQL. Destroy the disposable database after the run.

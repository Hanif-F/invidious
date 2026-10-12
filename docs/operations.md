# Deployment and operations

[Documentation index](README.md)

The application needs a working-directory installation with its binary, runtime assets/locales/config SQL, PostgreSQL, protected configuration and a separate Invidious Companion for playback. [Getting started](getting-started.md) covers local initialization; this guide covers maintaining the service.

## Deployment forms

The [Dockerfile](../docker/Dockerfile) uses multi-stage builds, pinned Crystal/OpenSSL build inputs, a nonroot runtime user and tini. It compiles tests/binary and copies runtime assets/config/locales. The checked-in [compose file](../docker-compose.yml) is for local development, has development database credentials, no companion service and mandatory secret placeholders. Record the actual image/digest and configuration used for a real deployment; a source Dockerfile does not describe a running remote host automatically.

[invidious.service](../invidious.service) is a sample systemd unit with an `invidious` user and installation-specific working/executable paths. Adapt those paths, writable log destination, database/network ordering and environment configuration. Run as a dedicated user. The `kubernetes/` directory contains a README directing operators to external Helm material; this repository does not ship a complete production Kubernetes manifest set.

For a reverse proxy, set canonical `domain`, optional `external_port`, `https_only`, trusted proxy CIDRs and real TLS termination. Keep PostgreSQL/private companion interfaces private. Forward media range requests and permit expected streaming/long-lived responses. Avoid buffering SSE or rewriting private response caching. Configure request/upload size and connection/read time limits to fit real imports and media behavior. These controls belong to the deployment, not to `https_only` alone.

## Health and monitoring

`GET /api/v1/stats` returns software metadata even with statistics disabled. The shipped compose healthcheck uses this for HTTP liveness. With statistics enabled, it returns versioned aggregate users, metadata timestamps and available playback accounting. It is not an authenticated account test, full database integrity test or proof that companion media works.

A useful staging smoke test checks the homepage/search, known channel, playable watch/embed video, a range media request, captions, signup/login, a private playlist, account preference save/history/position, native login and configured optional enhancements. Run it with controlled accounts/data; intentional upstream contribution writes need an actual user action.

Monitor response errors/latency, auth 403/429s, job failures/backoff, feed freshness, PostgreSQL disk/connection pressure, outbound access, companion failures and private cache behavior. Do not log credentials, full private feed URLs or decrypted identities. A software-only stats response cannot detect a stalled channel-refresh fiber.

## Background work

All jobs live in the application process as fibers and stop when it stops. Registration conditions are in [startup](../src/invidious.cr).

| Job | Enabled by | Cadence/behavior |
| --- | --- | --- |
| RefreshChannels | `channel_threads > 0` | Iterates stored channels; default 30-minute sweep delay, bounded concurrency and exponential error backoff |
| RefreshFeeds | `feed_threads > 0` | Scans stale account views, refreshes/recreates them, waits five seconds |
| StatisticsRefresh | `statistics_enabled` | Initial software/registration state, aggregate refresh every ten minutes |
| SubscribeToFeeds | Positive/enabled `use_pubsub_feeds` | Checks push subscriptions around once per minute; renews old/missing subscriptions |
| PullPopularVideos | `popular_enabled` | Updates process-local popular snapshot every minute |
| Notification | Always registered | PostgreSQL notification bridge and client connection coordination; retries after connection errors |
| ClearExpiredItems | Always registered | Deletes expired videos/nonces/positions/TV grants hourly, retries DB errors after ten minutes |
| InstanceListRefresh | Always registered | Alternative instance refresh every 30 minutes |
| AiSListRefresh | Always registered | Restores/refreshes classifications, repeats every six hours and prunes long-expired handles |

`enable_user_notifications` controls endpoint registrations; it does not prevent the notification bridge from being registered. Nested parsed `jobs.*.enable` is not wired into startup job instances in this checkout. Use effective top-level conditions rather than assuming the example's nested switches suppress work. There is no separately installed cron requirement for these loops.

## Backup and upgrade

1. Schedule maintenance and stop **all** application instances/writers sharing the database. Retain the deployed binary/image and config.
2. Back up PostgreSQL using a protected operator connection:

   ```sh
   pg_dump --format=custom --file=before-upgrade.dump "$IV_DATABASE_URL"
   ```

3. Securely preserve HMAC, DeArrow identity key, companion key and configuration separately. User JSON exports omit some persistent features and do not replace this backup.
4. Restore the dump to an empty isolated staging database and test the new binary/config there:

   ```sh
   pg_restore --exit-on-error --no-owner \
     --dbname="$IV_STAGING_DATABASE_URL" before-upgrade.dump
   INVIDIOUS_DATABASE_URL="$IV_STAGING_DATABASE_URL" ./invidious --migrate
   ```

5. Verify staging account login/ownership, history, private playlists, API scopes and playback. Account migration conflicts must be resolved deliberately; never delete/merge users merely to make a migration pass.
6. With production still stopped, run the new binary's `--migrate` using the protected production configuration, then start the new release and smoke test.

`IV_DATABASE_URL` and `IV_STAGING_DATABASE_URL` above are operator-supplied variables for these examples. The application override is `INVIDIOUS_DATABASE_URL`. Do not paste a production URL into a disposable test harness.

There are 23 current migrations. The account migration has an additional detailed procedure in [ACCOUNT_SECURITY.md](../ACCOUNT_SECURITY.md). `check_tables` does not supersede that process. Mixed old/new versions can alter shared schemas incorrectly and are not a supported upgrade shortcut.

## Restore and rollback

Restore the backup into a **new empty database**, verify it in isolation, and point the matching previous application/config at it. Do not run the previous version's schema checker against the upgraded database. Keep the upgraded database for reconciliation if traffic resumed. A backup restore loses later writes; plan reconciliation and announce the maintenance boundary appropriately.

DeArrow identity ciphertext needs its original key and account owner ID. Replacing its key breaks decryption; planned rotation requires explicit decrypt/re-encrypt with old/new keys under a controlled transactional procedure described in [contributions](dearrow-contributions.md). Keep HMAC consistent to preserve sessions/signatures, shared throttling and browser profile identities. Secret replacement has user-visible consequences even when SQL is unchanged.

## Logs and storage

`output: STDOUT` suits container logging; file output appends and creates parents. Provide external rotation/retention for files/collector storage. Request logger omits query strings and redacts credential-bearing webhook paths. Proxy/CDN logs must independently use equivalent redaction and access controls; application changes do not erase historical logs.

Database growth includes retained user history, clips/bookmarks and channel-video collections, not just the expiring video cache. Track storage and backup restore duration. Account sessions are rejected by expiry checks; do not assume every expired row is immediately deleted by the hourly cache cleanup. Disk cleanup must not drop persistent user tables under the assumption they are all caches.

## Release verification

[Development](development.md) maps unit, frontend and guarded database checks to changes. [SECURITY_READINESS.md](../SECURITY_READINESS.md) contains a historical implementation report and unresolved checks; it is not a fresh result for this documentation change. Real TLS/proxy/CDN policy, companion versions, physical mobile behavior and live upstream playback need deployment-specific verification.

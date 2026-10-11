# Getting started

[Documentation index](README.md)

Run commands from the repository root unless a command explicitly changes directory. These instructions target this checkout. They do not assume an already configured companion or database.

## Requirements

The dependency manifest [shard.yml](../shard.yml) declares Crystal `>= 1.14.1, < 2.0.0`; the repository Dockerfile builds with Crystal 1.21.0. That compatibility range is not a recommendation to deploy an old unpatched compiler. Shards installs the locked Crystal dependencies in [shard.lock](../shard.lock).

A native build needs Git, Crystal/Shards, a C toolchain and native development libraries for OpenSSL, libxml2, libyaml, GMP, SQLite and compression as required by the platform/linker. The exact package mapping is illustrated by [install-dependencies.sh](../scripts/install-dependencies.sh), [Dockerfile](../docker/Dockerfile) and [Nix files](../nix). The install script uses system package managers and privileges; inspect it before running on your host. Runtime CAPTCHA generation uses `rsvg-convert` and available fonts. Timezone features use system zoneinfo. PostgreSQL must be available; Invidious Companion must be deployed separately for video playback.

## Build locally

```sh
git submodule update --init mocks
shards install --skip-postinstall --skip-executables
crystal scripts/fetch-player-dependencies.cr
crystal build src/invidious.cr --release -Dskip_videojs_download -o invidious
```

The mocks submodule is for tests, not required for ordinary serving. Fetching player assets requires network access. Only skip the compile-time player download once the pinned assets are present. `make` is an alternative production-oriented build that installs production shards and resolves player dependencies during compilation.

The `.git` checkout is used to embed version information during compilation. Preserve the build context rather than copying only `src/` into an unrelated directory. [Development](development.md) explains verification and API-only builds.

## Configure and initialize

1. Create a dedicated PostgreSQL role/database using your database administration process. The development compose defaults are `kemal`/`invidious`; choose a separate password for your deployment. `scripts/deploy-database.sh` creates a role/database on supported systemd hosts, but does not replace the application migrations.
2. Copy [the example](examples/config.yml) to `config/config.yml`. Replace the database URL and HMAC key, and configure companion URLs/key to match your companion. Generate keys with `openssl rand -hex 32` and `openssl rand -hex 8` as explained in [configuration](configuration.md). Do not run with placeholders.
3. Run the migrator against this **new or backed-up** database:

   ```sh
   ./invidious --migrate
   ```

4. Start the application:

   ```sh
   ./invidious
   ```

5. Open `http://127.0.0.1:3000` for a loopback development configuration. Test search and a known playable video. A working home page does not establish that the companion/media pipeline works.

The sample config keeps registration/CAPTCHA enabled, statistics disabled, and binds loopback. Omit companion configuration only when intentionally testing browsing/account behavior without playback. Contributions require the separate DeArrow identity key; title reads do not.

## Docker development

[docker-compose.yml](../docker-compose.yml) is explicitly a **development** setup that builds this fork locally, starts PostgreSQL 14 and exposes port 3000 on loopback. Before use, replace **both** `hmac_key` and `dearrow_identity_key` placeholders in its `INVIDIOUS_CONFIG`, or remove the DeArrow setting when contributions are not needed. Configure a companion separately; this compose file has no companion service.

```sh
docker compose build
docker compose up -d invidious-db
docker compose run --rm invidious /invidious/invidious --migrate
docker compose up -d invidious
docker compose logs --tail=100 invidious
```

The database init hook runs only on an empty volume. It does not initialize every newer table by itself; explicit migrations cover the current schema and track versions. `check_tables: true` in compose adds startup checks, but upgrades still need the migration procedure.

The shipped healthcheck probes `/api/v1/stats`. When statistics are disabled, this endpoint still returns software metadata, so it remains usable as an HTTP liveness probe. It does not establish database correctness or video playback readiness. See [operations](operations.md).

## First use

Browse search/channels anonymously, then choose Preferences to adjust locale, theme, player behavior and content visibility. Sign up for subscriptions, playlists, clips, account history and synchronized positions. Configure `save_player_pos` to opt into position sync; it defaults false. Enhancements such as SponsorBlock, DeArrow and AI page actions default off.

For public service, complete [operations](operations.md) and [security](security.md): set the real public origin/TLS, trusted proxies, private database networking, persistent secrets and a verified backup. The sample service/container configuration is a starting point, not proof of deployment readiness.

# Public-access release gate

Repository security hardening is implemented, but this is not approval of an
uninspected production deployment. The review assumes open registration.

## Compatibility and verification

See [ACCOUNT_SECURITY.md](ACCOUNT_SECURITY.md#public-access-hardening) for the
cookie API CSRF flow and the POST-only playlist/theme controls. No new schema
migration is introduced by this hardening change.

Run `crystal spec -Dskip_videojs_download`, normal and `-Dapi_only` builds,
`crystal run tests/frontend/render_fixtures.cr -Dskip_videojs_download`, and
`node --test tests/frontend/playback-sync.test.cjs tests/frontend/ui.test.cjs`.
Run all four guarded disposable PostgreSQL harnesses documented in
[tests/database/README.md](tests/database/README.md). The account harness includes
the new production-route security checks; it is already part of frontend CI.
Do not use a production database for these tests.

The route tests check application cache headers. They cannot establish that an
external reverse proxy or CDN obeys those headers. Live YouTube playback and
upstream redirect compatibility require a staging smoke test.

## Results from this implementation

- Crystal 1.21.0: normal and API-only binary builds passed.
- Unit tests: 31 standard examples and 209 Spectator examples passed.
- PostgreSQL: account/security, blocking/playback, history, and DeArrow identity
  suites passed in an isolated PostgreSQL 16 container, which was removed afterward.
- The added Chromium and Firefox tests confirmed signed-in theme controls send
  CSRF-protected POST requests with and without JavaScript.
- Full frontend/playback run: 187 of 190 checks passed. The remaining three
  failures were reproduced against the unchanged HEAD revision in a temporary
  checkout: enlarged-text signed-in navigation in both browsers, and the 35 KiB
  asset budget. The budget was already exceeded (36,810 bytes at HEAD versus
  36,848 bytes after this change; limit 35,840 bytes). These unrelated UI issues
  remain open; the full frontend suite is not green.
- Changed Crystal files passed formatting checks; `git diff --check` passed.

## Production checks still required

No production domain or active proxy configuration was supplied for verification.
Before enabling registration:

- Verify public HTTPS, HTTP-to-HTTPS redirects, `https_only: true`, the canonical
  `domain`, and Secure/HttpOnly/SameSite session cookies. The app's direct port
  should only be reachable by the trusted reverse proxy.
- Set `auth_trusted_proxies` to the actual proxy CIDRs; remove client-supplied
  forwarding headers at the edge. Test independent-client throttling and spoofed
  forwarding headers through the deployed proxy.
- Use independently generated production secrets, consistent HMAC keys across
  instances, and protected configuration files. The checked-in compose file is
  explicitly for development; its database password is not a production secret.
- Keep PostgreSQL private and use a dedicated application role and database.
  Apply current server/OS/container security patches; record the deployed image
  digests and compiler version, not only a mutable tag.
- Bypass shared caching for requests carrying cookies or authorization, private
  feeds, and authenticated routes. Never override `private, no-store`. Test the
  same history, export, private playlist, and preferences URL as user A, user B,
  and anonymously through the real cache; compare bodies and cache-status headers.
- Configure request-body limits, upload/connection/read timeouts and resource
  limits at the proxy, including imports and media endpoints. Confirm expected
  imports/playback still work and oversized requests are rejected before reaching
  the application. Account login throttling alone is not a site-wide abuse limit.
- Redact credential-bearing queries and webhook paths in proxy/CDN logs and
  telemetry. Restrict access to historical logs and backups. Verify an encrypted,
  access-controlled backup can actually be restored into isolated staging.
- Run the existing account migration procedure if upgrading an older account
  schema. Recheck login, private playlists, imports, account deletion and API
  clients in staging before releasing traffic. Monitor authentication failures,
  403/429/5xx rates, storage growth, and outbound request failures without logging
  credentials.

## Dependency advisory review — 2026-09-21

- Crystal's [HTTP request-smuggling advisory](https://github.com/crystal-lang/crystal/security/advisories/GHSA-wqh5-7w63-pm68)
  identifies versions before 1.20.0 as affected. This checkout's Dockerfile and
  the local builds use 1.21.0. The broad minimum in `shard.yml` is compatibility
  metadata, not a recommendation to deploy an older unpatched compiler.
- The Dockerfile pins OpenSSL 3.6.4, an upstream
  [security patch release](https://github.com/openssl/openssl/releases/tag/openssl-3.6.4).
  A host-native build may link a different system OpenSSL; verify the deployed
  binary/image independently.
- [Kemal's public security page](https://github.com/kemalcr/kemal/security)
  listed no published advisories when reviewed. This is not evidence that all
  defects are known or that every transitive dependency is safe.
- Check the actual PostgreSQL minor release against the
  [upstream security list](https://www.postgresql.org/support/security/).
  The development compose file only specifies the major version, so the deployed
  patch level cannot be inferred from it.

This is a targeted public-advisory review, not a complete SBOM/container scan.
The deployed companion, reverse proxy, OS packages, and transitive libraries
remain part of the release review; their production versions were not supplied.

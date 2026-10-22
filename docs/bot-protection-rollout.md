# Rollout: 22 October 2026

Deployed to `fs:~/invidious` as `invidious-turnstile:20261022`.
Migration 25 is applied. The persisted policy is **enabled**, 12 hours,
revision 2. It was deployed disabled, validated with the production widget, and
then enabled through the authenticated administrator panel. The sole configured
administrator is the username **wingress**.

The administrator panel is available at
[Bot protection](https://invidious.wingress.net/admin/bot-protection), also linked
from Preferences → Administration. Production hostnames, HTTPS, private Companion
routing and a separate persistent verification signing key are configured.
The Managed widget is restricted to `invidious.wingress.net`, with pre-clearance
disabled. Production site/secret keys are stored in the private deployment's
`INVIDIOUS_CONFIG`; they are not committed to the repository. The existing
account HMAC key and credentials were preserved.

To disable protection or change its duration, use the administrator panel. Changing
the policy invalidates existing passes. See [configuration and recovery](bot-protection.md)
and the [mobile backend contract](mobile-api.md#instance-access-verification-turnstile).
No Mobivious code or general traffic rate limiter was changed.

Validation completed:

- Normal and API-only integration checks: gate coverage, aliases, HEAD, captions,
  manifests, ranges, credential stripping, cache headers, signed credentials,
  replay/provider failures, timeout, admin CSRF and process-restart persistence.
- Existing account/registration CAPTCHA/security integration checks passed.
- 55 focused frontend checks passed, including four new browser checks.
- The real Cloudflare always-pass test widget loaded under the verification CSP,
  completed the native event flow, and fit a 320-pixel WebView.
- The deployed HTTPS browser check passed disabled discovery/native-page behavior,
  administrator sign-in recovery, media CORS preflight and safe return handling.
- Caddy runtime-log credential redaction passed an isolated sentinel test.
- Production-key browser and native-header exchanges passed on an isolated
  instance with a separate database and signing key, using the allowed production
  hostname. Real Siteverify accepted the configured hostname/action. Both pass
  transports worked; forged passes failed; account authentication remained required.
- Production was enabled through the authenticated `wingress` session with CSRF.
  The enabled 12-hour policy survived an application restart. Anonymous pages
  redirect to verification; APIs, dynamic images and HEAD media requests return
  `verification_required` without an upstream call. Static resources remain available.
- The live browser completed verification, returned to the requested watch page,
  and played `2Yq9rVkhniI` for over a minute without a media error. Production
  logs confirmed 39 successful HTTP 206 Companion responses during the check.
- The normal production administrator panel stayed accessible after temporary
  recovery routing was removed. All temporary validation/recovery containers,
  routes, proxy processes and temporary key transfer/configuration files were removed.

The full `crystal spec` command has a pre-existing compile failure:
`undefined constant Invidious::Frontend::ChannelSpoilers`. The unchanged HEAD
revision was checked separately and fails identically.

During rollout, Companion exited with `Too many open files`; Invidious also
exhausted its inherited 1,024-descriptor soft limit under current connections.
Both container descriptor limits are now explicitly 65,536, and Companion has
`restart: unless-stopped`. PostgreSQL also exhausted its client slots; the
previously unlimited application pool is now bounded to 20 connections, five idle
connections, and a two-second checkout timeout. Database credentials were
preserved. These runtime resource settings do not impose an HTTP traffic rate
limit.

With protection disabled, incoming watch requests repeatedly exhausted Companion
connections and the content process stalled (over 100% of one CPU core, about
1.2 GiB memory and approximately 3,000 descriptors). A temporary process served
only the existing login/admin/verification/static endpoints so the administrator
could enable protection normally. The busy content process was then restarted to
clear already-running requests. After activation, unverified requests were gated
within milliseconds, health/discovery requests responded in 2–29 ms, memory was
about 48 MiB and descriptors dropped to 48. These are rollout observations, not a
long-term availability guarantee. Ordinary routing is restored; no recovery
process remains running.

Unchanged Android clients cannot access protected content until they integrate
the documented verification flow. No Mobivious implementation was included.

Rollback material is stored privately on `fs` in
`/home/hahafunny/invidious-turnstile-rollout-20261022/`: the database dump, source
archive, original Compose/Caddy configuration, final source checksum manifest,
and build logs. The previous image is tagged
`invidious-pre-turnstile:20261022`. Migration 25 is additive; disabling through the
panel or the documented SQL is sufficient for verification-provider recovery.

# Turnstile instance protection

Run migration 25 (`--migrate`) before startup when automatic table checks are off.
Fresh installs create `bot_protection_settings`, one row with protection disabled,
12-hour duration and revision 1. Policy is independent of environment-based YAML.
Changes commit atomically, invalidate prior passes and update this process
immediately; other processes refresh their cache within one second. Manual outage
recovery through PostgreSQL takes effect within one second on running processes:

```sql
UPDATE bot_protection_settings SET enabled = false, revision = revision + 1 WHERE singleton = true;
```

Set deployment configuration (or the corresponding `INVIDIOUS_…` variables):

```yaml
admins: ["administrator"] # existing usernames, compared case-insensitively
https_only: true
domain: video.example.com
external_port: 443
turnstile_site_key: "YOUR_MANAGED_WIDGET_PUBLIC_KEY"
turnstile_secret_key: "YOUR_SERVER_SECRET"
turnstile_signing_key: "PERSISTENT_RANDOM_VALUE_AT_LEAST_32_CHARACTERS"
turnstile_allowed_hostnames: ["video.example.com"]
turnstile_companion_private: true
```

Keep a persistent random `turnstile_signing_key` of at least 32 characters. It
isolates verification passes from account credentials. If omitted, the instance
`hmac_key` is used and must be at least 32 characters. Never commit production secrets. Omit Companion `public_url` so it uses `/companion`. Bind
Companion only on its private Docker network; do not expose its port, a second
hostname, reverse-proxy route, or direct origin. The readiness check verifies
configuration and requires the explicit private-routing attestation; operators
must verify firewall/listener/proxy configuration themselves. This application
gate works with DNS-only Cloudflare and with a proxied zone.
It does not itself issue an edge clearance cookie or provide a broad request rate
limiter. When a zone also uses Managed Challenge, the edge can block requests
before this server sees them, including native bootstrap and verification APIs.

Mobivious can display the same-origin native verification page, obtain browser
`cf_clearance`, and confirm it through a native discovery request. The cookie,
backend signed pass and account bearer are independent credentials. The client
uses the browser's user agent and limits clearance to the exact instance origin.
Embedded-browser and native-request acceptance must be checked against the actual
zone; a completed widget alone does not establish native access.

Optional [Turnstile pre-clearance](https://developers.cloudflare.com/turnstile/get-started/pre-clearance/)
requires the widget hostname to match the Cloudflare zone and a `managed` clearance
level or higher for Managed Challenge. Keep Siteverify validation and ensure the
verification page/assets are reachable under the chosen edge rules. Ordinary
Turnstile response tokens and this server's signed passes do not replace
`cf_clearance`. Neither enabling pre-clearance nor changing live edge policy is
part of installing the client update.

Sign in as an existing administrator and open the account menu → Instance settings
→ Bot protection, or `/admin/bot-protection` directly. Changes require a browser session
and scoped CSRF token. The direct panel, sign-in, registration and logout remain
accessible during provider outages. Administrator identity does not bypass the
content gate. Only configured usernames receive privileges; this feature never
creates an `admin` account. The existing registration CAPTCHA is unchanged.

The standalone policy form works without JavaScript and retains checkbox/duration
choices after rejected CSRF or invalid input. A rejection does not save policy.
Signed-in administrators and wrong-account denial pages offer a CSRF-protected
sign-out form. API-only builds use a minimal recovery login and a valid admin
destination, without unavailable browsing/signup links.

Challenge feedback is localized. Failure or cached-page return waits for explicit
Retry and a fresh challenge; duplicate callbacks and late results cannot issue a
second pass. Native completion keeps the existing bridge fields and does not put
the pass in the visible page, URL or browser storage. An iframe cannot complete
the top-level cookie flow: it offers an explicit new-window verification/watch
action. Mid-play expiry pauses/disposes embedded playback and retires its existing
enhancement consumers before showing recovery.

The same page owner distinguishes the required-login marker from verification
403 responses. Private watch/embed media failures check HEAD `/api/v1/stats`
before existing verification discovery; this reads local state without a provider
or video-metadata request. A failed network check does not establish expired
access. Departure invalidates outstanding checks and response callbacks; a profile
change or disposal also retires the wrappers. Late fetch/XHR denials from before
a cached return cannot interrupt the returned page.

Required-login middleware runs first, then bot protection, then content/upstream handlers. These gates are independent: a verification pass does not authenticate an account, and an administrator session does not bypass verification for content.
Dynamic images are protected too; only actual local static files are exempt.
Unknown dynamic routes default to protected. Other exemptions are legal pages,
`/api/v1/stats` health, verification/bootstrap endpoints and subscription webhooks
(which still verify their existing signatures). OPTIONS on API/media paths is
local and exposes no content. Browser navigations redirect; API/media receive
structured errors. Embeds offer a top-level verification/watch link when cookies
are missing. Passes are deliberately reusable bearer credentials until expiry or
policy changes; Siteverify responses are single-use. Verification is bot friction,
not DRM or a guarantee against a determined scraper obtaining a valid pass.

Application logs omit queries and never log verification bodies or headers.
Ensure external reverse-proxy/access/error logging also redacts
`X-Invidious-Verification`, Cookie and Set-Cookie. For Caddy, apply a filter to runtime logs as well as any access logger, for example:

```caddyfile
{
    log default {
        format filter {
            wrap json
            fields {
                request>headers>X-Invidious-Verification delete
                request>headers>Cookie delete
                resp_headers>Set-Cookie delete
            }
        }
    }
}
```

Default Authorization/Cookie redaction alone does not cover the custom header.
Do not turn on raw request-body logging.

Before activation, run the guarded database and frontend checks described in
`tests/database/README.md`, including an API-only build. Use mocked Siteverify
for integration checks and Cloudflare's documented test keys in a separate smoke
environment. Then verify a real browser against production hostnames/keys, test
range playback and recovery, and only then enable in the admin panel. Keep the
production rollout disabled while keys or validation are outstanding.

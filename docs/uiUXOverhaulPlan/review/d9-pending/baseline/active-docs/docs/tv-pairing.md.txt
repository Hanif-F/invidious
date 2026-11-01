# TV phone approval — contract v1

[Documentation index](README.md)

Tividious can obtain an ordinary native session after an explicit approval in a
signed-in browser. This follows the device interaction and polling behavior of
[RFC 8628](https://www.rfc-editor.org/rfc/rfc8628.html), adapted to this fork's
signed JSON native tokens. It does not introduce an OAuth server or change
`POST /api/v1/mobile/login`. Manual native login remains available independently.

## Protocol

All JSON endpoints below are public POSTs accepting `application/json`, bounded
to 16 KiB, and returning `Cache-Control: private, no-store`. No browser cookie is
needed on the TV. Credentials and private codes belong only in request/response
bodies. The TV must not send its existing bearer credential to these endpoints.

| Request | Response |
| --- | --- |
| `POST /api/v1/tv/pairing/start` with `{}` | 200 `{deviceCode,userCode,verificationUri,verificationUriComplete,expiresIn:600,pollInterval:5}` |
| `POST /api/v1/tv/pairing/token` with `{deviceCode}` | 200 `{accessToken,username,expiresAt,profileId}` or a protocol error |
| `GET /tv?user_code=ABCD-EFGH` | Existing browser login return, then the explicit account/code approval form |
| `POST /tv` form `user_code`, `decision=approve` or `deny`, `csrf_token` | Browser confirmation; contains no native credential |

`deviceCode` is 32 random bytes encoded as 43 unpadded URL-safe Base64 characters.
`userCode` has eight random characters from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, displayed `ABCD-EFGH`. Verification accepts
lowercase and omitted hyphens. The QR payload is `verificationUriComplete`, which
contains only the public code. Visiting it never approves access. The browser
shows the signed-in username, requested native account access and a reminder to
compare the code with the TV before choosing Approve.

The verification URI uses the configured external HTTPS origin, or an explicitly
listed `alternative_domains` alias matching the request Host. Forwarded hosts
are considered only from `auth_trusted_proxies`. Arbitrary Host values are never
reflected. Configure the canonical origin/aliases to match the origin selected
on the TV. The TV must reject cross-origin verification links.

Poll errors are HTTP 400 JSON `{error:code}`:

| Code | TV behavior |
| --- | --- |
| `authorization_pending` | Continue at the current interval |
| `slow_down` | Add five seconds to this and subsequent intervals |
| `access_denied` | Stop; show denial or invalidated approval |
| `expired_token` | Stop; offer a user-initiated new code |
| `invalid_grant` | Stop; unknown or already consumed grant |
| `invalid_request` | Stop; malformed shape, type, size or content type |

HTTP 429 `{error:"rate_limited"}` includes integer `Retry-After` seconds. Respect
it before another request. Connection timeouts should increase the polling
interval with bounded backoff. Only one poll may be in flight. Cancel the poller
on background, dismissal, cancellation, expiry, server/account change or success.
Do not silently allocate replacement codes. HTTP 403 `login_disabled` means
instance login is disabled. HTTP 503 `pairing_unavailable` means an API-only build
or a missing configured external HTTPS origin; no grant is allocated. Older
servers may return 404/405. Offer manual native login in these cases.

Success uses the existing native token verbatim, with the same scope allowlist,
30-day expiry and stable opaque `profileId` as mobile login. It is signed JSON,
not a JWT. Store it securely before showing account success. See
[native authentication](mobile-api.md).

## Storage, limits and revocation

Migration **23** adds `tv_pairings`; its fresh-install DDL is
[tv_pairings.sql](../config/sql/tv_pairings.sql). Device/public codes are stored as
separately domain-bound HMAC hashes. Pairing rows never store native tokens.
Transitions are pending → approved → consumed, or pending → denied. Expiry is
checked on operations, independently of the hourly expired-items cleanup. Terminal
rows remain until expiry so clients receive useful states.

Start admits five requests/minute and twenty/hour per client IP. Failed public
code/form verification admits five attempts/minute per IP and account; a blocked
client cannot bypass the limit with a valid code. Invalid private codes admit
thirty failures/minute per IP. Known grants enforce their persisted polling
interval, including cumulative slowdown. Limits reuse the shared database/HMAC
throttle facility and its trusted-proxy client-IP handling.

Approval and redemption lock the account before the pairing row. Redemption
revalidates and locks the approving browser session, issues through
`Accounts.issue_mobile` and consumes the grant in one transaction. Exactly one
redemption may mint a credential; failed issuance rolls back consumption.
Password/username changes, session revocation/expiry or account deletion before
redemption prevent issuance. Browser logout can delete a session without taking
a pairing lock; the session reference intentionally has no FK to avoid reversed
lock order. Account deletion nulls the account reference and prevents issuance.

Application request logs omit query strings and never print request/response
bodies. Configure reverse proxy/CDN logs to omit codes too, and preserve no-store
headers. The approval page also sends `Referrer-Policy: no-referrer`.

## Upgrade and verification

Follow [backup, upgrade and restore](operations.md): stop all writers, back up,
test the upgrade in isolation, run `--migrate` with the new binary, then start it.
The migration is additive and transactional; there is no down-migration command.
Deploy a full browser-enabled build, configured external HTTPS origin, and the
new approval template alongside the API routes. Keep HMAC stable across instances.
No new companion service, callback endpoint on the TV or third-party relay is
required. Source implementation alone does not prove deployment.

The guarded [account integration harness](../tests/database/README.md) checks
migration/fresh SQL, pending/slowdown/denied/expired/consumed states, limits, CSRF,
two-redemption races, issuance rollback, revocation, native scopes/profile
compatibility, and registered HTTP routes through browser login/approval to native
authentication. It uses synthetic accounts and a disposable database only.
API-only behavior is checked without a database:

```sh
crystal run tests/tv_pairing_api_only.cr -Dapi_only
```

Real Tividious QR acceptance must be recorded separately against the deployed
selected origin. Never treat the local HTTP harness as a deployed-server pass.

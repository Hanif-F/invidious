# D7 verification and recovery checkpoint

[Master plan](README.md) · [D7 contract](d7-contract.md) · [Coverage](coverage.md) · [Evidence](review/d7-verification-evidence.json)

**Verification and recovery are locally verified; this checkpoint is frozen.**
Account/data is accepted separately. Legal/message/error and minimal embed work, followed by
D8–D9, remain required. Nothing has been deployed.

## Implemented behavior

Verification and the administrator's policy form use shared tokens, restrained
standalone panels, explicit labels and localized status. Admin forms work without
JavaScript, retain failed checkbox/duration drafts, renew CSRF and preserve the
403/400 status without saving policy. Wrong-role responses give readable denial
and a CSRF-protected sign-out action without exposing policy controls.

The challenge controller has one owner per configuration node. Duplicate callbacks,
late provider results, pagehide and cached return cannot issue or replay a pass.
Failure waits for deliberate Retry and a fresh challenge. Strict response checks
reject malformed credentials and unsafe browser return URLs. Parser failures
never echo token fragments. Successful native completion retains the existing
three-field bridge event and writes no credential into the DOM, URL or storage.
Disabled/native bootstrap and unavailable-provider copy describe actual state.

Blocked iframes render a script-free recovery panel with an explicit new-window
action and self-only style CSP. Mid-play expiry pauses at zero/unknown position,
retires existing enhancement consumers and disposes the player before replacing
the embed document. Old media metadata is cleared. Known playback time and normal
browser/native protocols remain intact.

API-only recovery uses a minimal shell and ordinary login with duplicate protection.
It hides unavailable signup/Privacy navigation and uses admin Settings for the
default return while preserving explicit safe destinations. Authentication,
verification, scopes, CSRF and role checks stay independent.

## Verification boundaries

- **52/52 final Chromium/Firefox cases** cover account/data regressions and the
  standalone challenge/admin/native/API-only flows, no-JavaScript forms, themes,
  1280–1920px geometry, enlarged RTL, escaped diagnostics, wrong-role recovery,
  idempotence, malformed responses, provider/attempt races and cached return.
- Normal and API-only guarded production mock-provider harnesses pass migration,
  route families/HEAD/ranges, credentials, actual ordinary recovery login/session,
  administrator role/CSRF/draft behavior, policy persistence and restart. These
  precede only the final view labels/direction/footer refinement.
- Fresh final normal/API-only type checks, fixture build/render, JavaScript syntax,
  Crystal formatting, generated references, documentation and whitespace pass.
  Five final Light/Dark/enlarged RTL views were inspected. Chromium's resolved
  heading font was also checked: locally installed Noto Sans, with no font request.
- The final read-only guard confirms the exact task-owned container/loopback
  binding and idle databases: verification six tables, account/data 24 tables,
  each with zero other connections. All sixteen earlier manifests are unchanged.
- Initial browser execution stalled in a test-only disabled-JavaScript styling
  helper. The helper now appends test scaling to intercepted CSS; subsequent
  16/16, 49/49, 50/50 and 52/52 phase logs are retained. Later controller/visual
  refinements have their own final 52/52 run; earlier totals are not added together.

All browser requests/providers/media are intercepted and synthetic. Production
route checks use only the task-owned disposable PostgreSQL databases and loopback
HTTP. No deployed server, real Cloudflare challenge, upstream provider, physical
native client or native TV app source is involved. D8 still owns full repository
regressions and asset/runtime retirement; D9 owns the final semantic handbook audit.

# Settings, account, and status

Use the existing layout, form, and feedback components as the starting point. Keep one set of submitted fields, ordinary form handling, and current role and privacy rules. Standalone documents keep their existing shells. [Shared shell and form geometry](01-foundation-and-shell.md) · [Preferences](../preferences.md) · [Account behavior](../accounts-and-library.md)

## Settings

### Navigation and forms

1. On phones, stack search and category navigation above the panel. When enhancement is ready, show the labeled native category select and explicit Go button. Generate its options from the same ordered and role-filtered destinations used by the current links. Keep the links as the baseline with scripts unavailable. Keep the current link navigation on desktop.
2. Initialize the select to the active category. When the user chooses another option, wait for Go. For in-document categories, route Go through the existing Settings loader and use its draft, pending and retry handling. Update the active option and accessibility state after the category loads. On a failed load, leave the old category active and preserve the existing retry target. Clear the local search when submitting a category via Go. Search results retain their links, field targets, and current loading behavior.
3. Use ordinary navigation for dedicated editors and admin links. Preserve existing category URL replacement, Back/Forward behavior, `?field=` navigation, and legacy hash redirects or fallback links. Preserve the existing unsaved draft prompt on full-page navigation and profile invalidation on a signed-in identity change. Changing the selector must leave the current form and drafts intact until navigation is chosen.
4. Reflow `.settings-layout` into one column. Stack field labels, help, and inputs in source order. Let checkbox labels wrap and keep their controls aligned. Use full available width for selects and editable text fields. Wrap Save, Discard, secondary links, and feedback in document flow. Keep error association, canonical read-back, and current operation guards.
5. Present editable AI Filter and SponsorBlock matrices as stacked labeled groups at phone widths. Reuse the single rendered control for each setting. Preserve identifiers, field names, descriptions, values, labels, order, and form submission. Show the field's label next to its control on phones. Keep wider row/column relationships and verify that the phone accessibility tree exposes group and field names after reflow.

[Settings navigation template](../../src/invidious/views/overhaul/settings_navigation.ecr) · [Navigation search](../../assets/js/settings-navigation.js) · [Category controller](../../assets/js/settings.js) · [Category and field ownership](../../src/invidious/web_preferences.cr)

### Category coverage

| Category or page | Required coverage |
| --- | --- |
| Appearance and Language | Theme and nickname visibility where available, locale, region, timezone and detection, long native select labels, RTL and field deep links. |
| Browsing and feeds | Default home, feed menu, search privacy, original titles, member visibility and cross-instance behavior. Keep ordered controls readable and the actual form values intact. |
| Playback and Captions/Comments | Playback mode and defaults, tracks and quality, speed and seek, VR and annotations, caption and comment ordering, recommendations, and description preferences. |
| Library | Signed-in only. History and progress settings, feed defaults and default playlist. Preserve role gates, current option data, and the effect of acknowledged changes. |
| SponsorBlock | Enable and default category mode and color, including legacy values. At `/preferences/sponsorblock/channels`, reflow channel lookup, per-category rules, inherit/reset, and save/error feedback. |
| DeArrow | Preference switches and identity page. Keep empty, configured, setup unavailable, import, remove, explicit check and stale/uncertain states. Fit long identity text without exposing a secret in new markup or diagnostics. |
| AI Filter | Enable/paused and provider/status states, the two list actions for each surface, and their explanatory text. Keep channel filtering behavior in the owning surfaces. |
| Chat Replay | Dedicated `?section=chat` page. Stack typography, timing-related settings, filters and blacklist fields. Preserve current guest/account storage, limits, validation, save and retry. Test Watch's related dialog separately. |
| Channel spoilers and blocked channels | Stack lookup, selected channel, identity and rule details. Keep title and thumbnail rules, reveal delays, add/remove and explicit recovery actions. Cover empty, invalid, unavailable, stale and uncertain states where available. |
| Instance settings | Reflow `/admin/settings` in the full shared shell and in the API-only standalone shell. Keep grouped forms, disabled and read-only states, save and validation, role restrictions, recovery links, and supported field targets. |

**Accept when** a guest and a signed-in user can select every allowed category, deep-link to fields, retain drafts across enhanced navigation and rotation, save or discard, and recover from a failed category load or write. Exercise the administrator category and dedicated editors. With scripts unavailable, follow the ordinary links and submit the existing HTML forms.

## Account and data

| Surface | Phone requirements and cases |
| --- | --- |
| `/login`, `/signup`, sign-out | Keep username, password, confirmation, CAPTCHA when configured, validation, and alternate links in source order. Fit CAPTCHA media without hiding the challenge. Keep field labels above full-width controls and submit reachable with a keyboard open. Verify enabled and disabled registration, required login, failure, return to the intended page, and API-only login. Sign-out retains its ordinary action and destination. |
| `/account`, `/account/username`, `/change_password` | Keep rename and password forms separate with their own status and confirmation inputs. Keep correct autocomplete and focus on errors. Test failure, success, session rotation, and guest redirect. |
| `/delete_account`, `/clear_watch_history` | Keep explanatory text, separate confirm and cancel controls, current-password fields where required, and ordinary submission. Cover denied, invalid, canceled and successful outcomes through the existing flows. History entry and grouping are in the library work item. |
| `/token_manager` and authorization | Stack identity, details and revoke actions per session. Wrap long IDs. Cover empty and populated states and failed or confirmed revoke. Fit scope lists, callback URL, consent/deny, and issued token at `/authorize_token` and the browser consent response of `POST /api/v1/auth/tokens/register`. Preserve callback and copy behavior. |
| `/data_control` | Keep export types as reachable links or controls. Stack import source, its instructions, native file picker, selected filename, and submit. Test Invidious JSON, YouTube subscriptions/playlists/history, FreeTube, NewPipe subscriptions and archive, and the existing failed, partial, and unknown-result states. Preserve formats, sizes, request semantics, and privacy. |
| `/tv` | Fit the pairing code and approval fields in one column. Keep error and approved status legible. Exercise signed-out return, code entry, rejection and approval, and an ordinary submission on a short viewport. Keep native redemption and the browser/native handoff contract. |

Use the platform input and file controls. Keep focused inputs visible when the virtual keyboard reduces available height. Keep ordinary navigation and forms functional after failed enhancement, with current error/status text and recoverable fields. Keep sensitive values out of screenshots, logs, URLs, and new browser state.

[Account templates](../../src/invidious/views/user) · [Account forms](../../assets/js/account-forms.js) · [Data exchange](../data-import-export.md) · [TV pairing](../tv-pairing.md)

## Standalone and reading pages

- **Verification and provider handoffs.** Cover `/verify` browser and native handoff variants, including the localized `client=native-cloudflare` document and API-only equivalents. Reflow the panel, status, Retry, no-JavaScript explanation, sign-in, settings, and privacy links. Keep provider content usable at 320 px. If its normal presentation is wider than the available space, use the provider's supported compact presentation on initial render. Keep the provider iframe intact. Preserve existing callbacks and explicit retry, and avoid rerendering an active challenge solely due to a layout change. Verify disabled, not configured, loading, success, expiration, timeout, failure and cached-page recovery.
- **Administration and notices.** Cover `/admin/bot-protection` as administrator, guest, and denied user, and enabled, disabled, unavailable, invalid and read-only states. Fit nested options, field help, save and error messages. Cover API-only settings/login recovery and iframe required-login and verification notices. Keep the standalone brand and permitted actions, with the existing new-window handoff where used. Preserve the active destination and existing response/security headers.
- **Privacy, licenses, and messages.** Keep the privacy index and reading width comfortable and internal anchors reachable below sticky chrome. Keep the JavaScript license table's semantics, keyboard focus, and local horizontal scroller. Wrap the rest of the page. Cover generic messages, feature-disabled responses, and ordinary navigation. Preserve actual license links and IDs.
- **Errors.** Cover the shared full-web error page, API-only status shell, and embed-specific status. Fit 401/403, 404, unavailable video/clip, and unexpected server errors. Keep detail disclosure, permitted retry, reporting and navigation actions in source order. Preserve redaction, read-only recovery, no-JavaScript behavior, and privacy for POST searches, callback URLs, and credentials.

**Accept when** a user can complete the allowed account, data, TV, admin, and recovery actions at 320 px and short landscape. Verify ordinary forms, long localized copy, denied or unavailable states, independent license scrolling, and keyboard focus. Test the provider with the existing deterministic stub in required CI.

[Verification template](../../src/invidious/views/verification.ecr) · [Verification controller](../../assets/js/verification.js) · [Standalone notice](../../src/invidious/views/overhaul/standalone_notice.ecr) · [Status shell](../../src/invidious/views/overhaul/status_shell.ecr) · [Recovery contract](../bot-protection.md)

# Current-version documentation audit

[Master plan](README.md) · [Progress](progress.md) · [Coverage](coverage.md) · [Documentation maintenance](../documentation.md)

## Baseline and limits

Audit date: 26 October 2026. Implementation baseline: **22fc2a66**, including the 23 October JavaScript enhancement and subsequent video metadata fix. This audit began during planning and was reconciled against the source on 26 October 2026 for D0. The corrections below have now been applied to the baseline handbook before interface implementation. It is not a fresh remote/deployment test.

Sources include the route registry, all 64 template/partial paths, presentation helpers, first-party browser-module inventory, preference/write handlers and storage validation, migration registry/SQL, native contracts, test harness documentation and historical reports. The [coverage matrix](coverage.md) assigns every template and dynamic surface to an implementation task. The [generated references](../README.md#complete-source-references) remain the exhaustive code-derived route/input/config/preference/schema/migration/source inventory.

No account, production database, upstream contribution, remote host or deployed policy was changed. No browser/media/database test is claimed by this documentation audit. Existing screenshot artifacts were inspected as dated examples during planning and are not new-runtime evidence.

## Findings and applied corrections

| Finding | Authoritative source | Planned correction |
| --- | --- | --- |
| Accounts guide called web playlist order a TODO stub | routes/playlists.cr move_video_before; database/playlists.cr move_video; library.js | Document actual web transaction/decimal occurrence inputs, duplicates/unloaded rows, 409 behavior; retain distinction that native versioned reorder API is absent |
| Current handbook omitted recent collection interactions | browse.js/library.js/preferences.js/player-dock.js and matching production fixtures | Add Load more/restoration/private POST, on-demand batch semantics, full-form drafts/read-back and automatic docking/current persistence |
| Old Preferences → Content directions | user/preferences.ecr enhancements/DeArrow section and identity form | Correct contribution guide/frontend README to current Enhancements → DeArrow destination |
| Handbook/operations stopped at 23 migrations | Registered migrations 0024/0025 and fresh SQL | Link live inventory instead of stale counts; add original-title/bot policy milestones/table/cleanup descriptions |
| Integration catalog omitted source-title and verification services | original_titles.cr; bot_protection.cr; verification routes | Add oEmbed and Turnstile roles/boundaries without claiming live availability |
| Bot-protection guide implied gate order superseding required login | invidious.cr registers RequiredLoginHandler before BotProtectionHandler | Explain independent gates and actual precedence |
| Bot-protection examples embedded one operator's live names | config example is generic; rollout is dated operational history | Use placeholder administrator/example host in current instructions; preserve actual dated observations only in archive |
| Troubleshooting implied importer exceptions could still return 204 | authenticated.cr import_invidious rescue branches; imports.cr partial sections | Explain 204 completion, 400 invalid watched IDs, 500 other errors, skipped records and possible prior-section persistence |
| README's upstream screenshots implied current fork appearance | Existing screenshots versus current Diary/QoL fixtures | Remove active old screenshot collage, label legacy images historical, link current frontend and future overhaul docs |
| Historical security counts/host policy mixed with current handbook | SECURITY_READINESS.md commit aadab598; bot-protection-rollout.md dated 22 October | Archive unchanged report bodies with dated context/rebased links; keep short compatibility pointers, current security/operations guides authoritative |
| Root SponsorBlock document duplicated current behavior guidance | docs/sponsorblock.md plus original attribution | Consolidate operating guidance in handbook while retaining root source/data-license attribution |
| New plan directory ignored by repository defaults | .gitignore /docs/* exclusions | Admit the requested plan directory now; admit the archive directory when the future documentation cleanup creates it |

## Guide-family reconciliation checklist

| Family | Documents reviewed | Required outcome and boundaries |
| --- | --- | --- |
| Product/navigation | README; overview; features; docs index | Current Diary remains described as current. Future design is separately linked. Home, major capabilities and native/client boundaries retained |
| Discovery/library | search-and-feeds; accounts-and-library | Correct recent JS and reorder behavior; keep public/personalized filtering distinction, source references, ownership/privacy, scopes and RSS semantics |
| Playback/settings | playback; preferences; frontend; theming | Document current automatic docking/full-form saves, category/admin coupling and unpersisted layout. Preserve per-field media storage, caption delivery and metadata failure limits. Planned retirements are not prematurely described as implemented |
| Enhancements | sponsorblock; AI channel filter; channel spoilers; DeArrow contributions | Keep category/action/masking precedence, private identity and no automatic write retry boundaries; fix outdated destinations |
| Clips | native-clips | Popup/iframe editor remains the correct baseline; side-panel/same-player behavior is future work. Native bounds, ownership, immutability and excluded features retained |
| API/native/TV | api; mobile-api; tv-pairing; generated routes/inputs | Contracts retained, including separate full/sparse/chat writes, occurrence representations, credentials, scopes, private/no-store and TV protocol. Browser retirement does not authorize wire-field removal |
| Data | data-import-export; database; generated schema/migrations | Add missed cache/policy tables/milestones; align importer troubleshooting with error/status and partial-write behavior. Exports remain incomplete for full instance recovery |
| Architecture/configuration | architecture; configuration; getting-started; example configuration | Keep current globals/layers, proxy/Companion boundaries, environment precedence, build flags and migration/setup prerequisites. No remote installation performed |
| Operations/security | operations; security; bot-protection; ACCOUNT_SECURITY | Keep current backup/recovery, secrets, permissions and standalone recovery instructions. Fix ordering/examples/cleanup and separate dated deployment records |
| Development/maintenance | development; documentation; frontend/database test READMEs; generated source map | Keep actual checks/limits; document before/after semantic audit lifecycle. Existing mobile coverage is baseline behavior, not new mobile overhaul acceptance |
| Integrations/troubleshooting | integrations; troubleshooting | Fill missing service boundaries, correct import advice, retain safe failure/diagnostic distinctions and no destructive generic-reset advice |
| Historical/legal | archive index/reports; changelogs; SponsorBlock attribution; licenses | Preserve and label dated reports, consolidate active duplicate instructions, and retain release/license history |

## Required structural checks

Run reference generation in check mode, the handbook link/reachability checker and whitespace checks. As part of the documentation cleanup, make the plan and any new archive documents reachable from docs/README.md. Check the template inventory against actual paths and ensure plan/archive files are not ignored.

The result and commands belong in [progress](progress.md). Passing these checks confirms structural consistency, not live runtime/deployment behavior. Later implementation tasks update guides when behavior actually changes, and D9 repeats this semantic reconciliation against the completed interface.

## Deliberately retained current behavior

Diary, thin/compact rendering, whole-form preferences/admin coupling, automatic docking, click-to-cycle titles, browser overlay replay and clip popup are current baseline behavior. Their replacement is explicitly specified in the master plan. Keeping accurate baseline guidance is not permission to preserve retired behavior in the final interface.

The account-upgrade procedure remains active operational guidance. Dated release test results, dependency observations, host policies and private rollback locations remain history. Exact remote availability and current third-party security/version recommendations are not inferred from those records.

# D9 acceptance — 1 November 2026

[Master plan](README.md) · [Semantic audit](d9-semantic-audit.md) · [Requirement audit](d9-requirement-audit.md) · [User handoff](user-handoff.md) · [Evidence](review/d9-evidence.json)

D9 completes the repository documentation and handoff after D0–D8. The semantic
pass covers every top-level handbook page, root/active test instructions, current
ownership/design contracts and coverage. It corrects obsolete Diary, full-form
controller, popup-player, movement-button, chat appearance and unaccepted-runtime
claims. Current gallery links use inspected, immutable D8 images. Native API and
separate client/device boundaries remain explicit.

Coverage preserves 65 baseline inventory rows and directly maps every one of the
93 current ECR files to a screen family, V IDs and feature acceptance. Every
S01–S16 and dynamic-module row is reconciled. The [final requirement audit](d9-requirement-audit.md)
maps all D0–D9 stages, master/design requirement groups and the nine final
verification criteria. Every V01–V36 has its own accepted D8 implementation/test row.

## Documentation and evidence gates

The final local gates check deterministic generation of all seven references,
local paths/Markdown and explicit HTML anchors, fences, handbook index reachability,
new/tracked whitespace, workflow YAML/trigger/command structure and six isolated
checker boundary cases. The new documentation workflow runs on push/pull_request,
including doc-only changes, with read-only permissions and no app/database/network
integration. Remote GitHub Actions has not been run from this checkout.

The new checker additionally covers seven active root/screenshot/test documents.
The negative validation proves missing targets/anchors, unclosed fences,
unreachable pages and reference drift fail, while a root link to an explicit
HTML anchor succeeds. A draft link check caught a mistyped API source path and
references to the not-yet-created acceptance page; those were corrected before
final acceptance. These documentation phases are distinct from product tests.

The final conservation gate compares all **545 D8 source/test hashes** and all
**1,256 protected prior review artifact hashes**, with no changes. The complete
product suite is not rerun for documentation-only changes. D8's one terminal
902/902 frontend pass, 437 spec examples, linked normal/API builds, full guarded
backend and inspected images remain the product acceptance. No sums of focused
reruns or live/deployed claims are introduced.

Exact output, source inventories, commands and final document/artifact hashes are
retained in the [D9 evidence manifest](review/d9-evidence.json). Historical accepted
review files remain immutable, including the directory named `d8-pending`.

## User delivery

The [handoff](user-handoff.md) provides build commands, matching binary/assets/
locales/SQL, Git-derived asset cache identity, data/secret preservation, staging/
migration and activation checks, cache refresh and previous-release rollback.
It distinguishes optional real-provider/native-device/proxy checks from completed
repository requirements. TV work is browser approval for the existing native
protocol, not native TV application development.

The source is uncommitted at HEAD `0f8703fd66e58be7c2001cabe55eddc091aabd04` plus
the complete overhaul; Git metadata is read-only here. The directory is admitted
by `.gitignore`; the user must review/stage/commit all new files before a release
build. No remote commit/push/deployment, production database/provider/contribution
write or native-device access occurred. The test database was already cleaned up
at D8. Mobile website redesign and external client implementations remain outside
the objective. No required repository implementation remains pending.

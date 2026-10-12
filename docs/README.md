# Invidious application documentation

This handbook documents **this repository's implementation**, including its fork-specific features. It is based on the source tree reviewed on **2026-10-11**. It describes code behavior, not a claim that a particular deployment or every upstream integration has been tested. Companion software and native client implementations live outside this repository; their server contracts are documented here.

## Start here

| Goal | Read |
| --- | --- |
| Understand the application and its boundaries | [Overview](overview.md), [feature catalog](features.md) |
| Build and start an instance | [Getting started](getting-started.md), [configuration](configuration.md) |
| Use search, channels and feeds | [Discovery guide](search-and-feeds.md) |
| Understand the player, streams and downloads | [Playback guide](playback.md) |
| Manage accounts, subscriptions and playlists | [Accounts and library](accounts-and-library.md) |
| Configure appearance and behavior | [Preferences](preferences.md), [theme authoring](theming.md) |
| Move user data | [Import and export](data-import-export.md) |
| Build an API client | [API guide](api.md), [native/mobile API contract](mobile-api.md) |
| Understand backend design and storage | [Architecture](architecture.md), [database](database.md) |
| Maintain or deploy an instance | [Operations](operations.md), [security](security.md), [troubleshooting](troubleshooting.md) |
| Change or test the code | [Development](development.md), [frontend](frontend.md), [documentation maintenance](documentation.md) |
| Understand upstream services | [Integrations](integrations.md) |

## Feature-specific contracts

The existing detailed guides remain part of this handbook:

- [AI channel filtering](ai-channel-filter.md): classifications, page actions, compatibility and caches.
- [Native clips](native-clips.md): editor, public links, ownership, range constraints and API.
- [DeArrow contributions](dearrow-contributions.md): identity encryption, submissions and votes.
- [SponsorBlock](sponsorblock.md): skipping modes, categories and per-channel overrides.
- [TV phone approval](tv-pairing.md): contract v1, browser approval, native redemption and deployment prerequisites.
- [Mobivious API](mobile-api.md): native authentication, safe preference patches, library, history, downloads, chat and classification contracts.
- [Theming](theming.md): authoring interface and design guidance.

## Complete source references

| Reference | Coverage |
| --- | --- |
| [HTTP routes](reference/routes.md) | Every explicit HTTP method/path registration, handler and build-time boundary |
| [Route inputs](reference/route-inputs.md) | Literal query, path, form and JSON reads per registered handler, with extraction limitations |
| [Configuration defaults](reference/configuration.md) | Top-level settings and nested configuration structures, including instance preference defaults |
| [Preference fields](reference/preferences.md) | Serialized user settings and legacy AI compatibility fields |
| [SQL schema](reference/schema.md) | All fresh-install columns, indexes, defaults, keys and constraints |
| [Migrations](reference/migrations.md) | All 23 versioned database migrations |
| [Source map](reference/source-map.md) | Application modules, templates, browser assets and project tooling |

The [coverage map](documentation.md#coverage-map) ties each subsystem to its guide and implementation. Source-derived references can be regenerated and checked with the scripts in [tools](tools/). Examples use placeholders and do not contain deployment secrets.

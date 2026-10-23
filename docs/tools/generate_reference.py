#!/usr/bin/env python3
"""Regenerate source-derived documentation; --check detects reference drift."""
from pathlib import Path
import argparse
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/reference"


def link(path):
    return f"[{path}](../../{path})"


def cell(value):
    return value.replace("|", "\\|").replace("\n", " ")


def header(title, source):
    return (f"# {title}\n\n[Documentation index](../README.md)\n\n"
            f"Generated from {source} by [generate_reference.py](../tools/generate_reference.py). "
            "Regenerate after changing the source; do not edit generated tables manually.\n\n")


def route_rows():
    group = "register_all"
    rows = []
    for line in (ROOT / "src/invidious/routing.cr").read_text().splitlines():
        found = re.match(r"  def (register_\w+)", line)
        if found:
            group = found[1]
        found = re.match(r'\s*(get|post|put|patch|delete|options)\s+"([^"]+)"\s*,\s*(.*?)\s*,\s*:(\w+)', line)
        if found:
            method, path, controller, action = found.groups()
            controller = re.sub(r"\{\{\s*namespace\s*\}\}", "Routes::API::V1", controller)
            controller = re.sub(r"\s+", "", controller)
            rows.append((group, method.upper(), path, controller, action))
    return rows


def handlers():
    result = {}
    for path in sorted((ROOT / "src/invidious/routes").rglob("*.cr")):
        text = path.read_text()
        module = re.search(r"^module (Invidious::Routes::[\w:]+)", text, re.M)
        if not module:
            continue
        methods = list(re.finditer(r"^  (?:private )?def (?:self\.)?(\w+)[(\s]", text, re.M))
        for i, match in enumerate(methods):
            body = text[match.end():methods[i + 1].start() if i + 1 < len(methods) else len(text)]
            result[(module[1].removeprefix("Invidious::"), match[1])] = (path.relative_to(ROOT), body)
    return result


def make_routes(rows, methods):
    text = header("HTTP route reference", link("src/invidious/routing.cr"))
    text += (f"All **{len(rows)} explicit method/path registrations** are listed in registration order. "
             "`:id` and other colon names are path parameters; `*` is a wildcard. Static assets and Kemal's implicit handling (such as HEAD) are not separate rows.\n\n"
             "GUI groups are omitted by `-Dapi_only`. RSS, JSON API, manifests, image/media proxies and configured companion routes remain. "
             "`/companion/*` requires a nonempty companion configuration. Notification registrations require `enable_user_notifications`. "
             "Public routes can still enforce resource privacy; `/api/v1/auth/*` always passes authentication. "
             "See [API conventions](../api.md), [security](../security.md), and [playback](../playback.md) for contracts.\n\n")
    last = None
    for group, method, path, controller, action in rows:
        if group != last:
            text += f"\n## {group.removeprefix('register_').replace('_', ' ').capitalize()}\n\n| Method | Path | Handler | Implementation |\n| --- | --- | --- | --- |\n"
            last = group
        source = methods.get((controller, action))
        if not source:
            raise ValueError(f"Unresolved route handler: {controller}.{action}")
        text += f"| {method} | `{path}` | `{controller}.{action}` | {link(str(source[0]))} |\n"
    return text


def make_inputs(rows, methods):
    text = header("Route input reference", "registered handlers under " + link("src/invidious/routes"))
    text += ("This companion to the [route list](routes.md) records literal input names read directly by each registered handler, including browser forms. "
             "These are observed names, not a required-field schema. A dash means no literal reads of that kind in this method. "
             "Shared helpers add inputs: search filters, video query overrides, authentication/CSRF, pagination, native JSON wrappers and preference converters. "
             "Read the linked implementation and the narrative API guides for validation, defaults, nested objects and response schemas. "
             "`data[...]` includes locally parsed objects and may include internal data; it is listed separately to avoid treating it as a guaranteed request field.\n\n")
    grouped = {}
    for group, method, path, controller, action in rows:
        grouped.setdefault((controller, action), []).append((method, path))
    for key, routes in grouped.items():
        path, body = methods[key]
        names = lambda kind: sorted(set(re.findall(r'env\.params\.' + kind + r'\["([^"]+)"\]', body)))
        data = sorted(set(re.findall(r'\bdata\["([^"]+)"\]', body)))
        text += f"## {key[0]}.{key[1]}\n\n"
        text += "; ".join(f"`{method} {route}`" for method, route in routes) + f". Source: {link(str(path))}.\n\n"
        for label, values in [("Path", names("url")), ("Query", names("query")), ("Form", names("body")), ("JSON via Kemal", names("json")), ("Local data keys", data)]:
            if values:
                text += f"- {label}: " + ", ".join(f"`{value}`" for value in values) + ".\n"
        if not any(names(kind) for kind in ("url", "query", "body", "json")) and not data:
            text += "Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.\n"
        text += "\n"
    return text


def property_rows(text):
    return re.findall(r"^\s*property (\w+)\s*(?::\s*(.+?))?\s*(?:=\s*(.*))?$", text, re.M)


def make_config():
    source = (ROOT / "src/invidious/config.cr").read_text()
    text = header("Configuration defaults", link("src/invidious/config.cr"))
    text += ("Values below are **code defaults**, expressed as Crystal literals, rather than deployment recommendations or fully serialized YAML. "
             "A dash means no explicit initializer. Nullable values without an initializer are unset; nonnullable fields are required when their structure is used. "
             "Converters normalize some values. See [configuration](../configuration.md) for precedence, examples and constraints.\n\n")
    sections = [
        ("Top-level Config", source[source.index("  # Number of threads"):source.index("  struct VideoJSConfig")]),
        ("db", source[source.index("struct DBConfig"):source.index("struct SocketBindingConfig")]),
        ("socket_binding", source[source.index("struct SocketBindingConfig"):source.index("struct ConfigPreferences")]),
        ("http_proxy", source[source.index("struct HTTPProxyConfig"):source.index("class Config\n")]),
        ("invidious_companion[]", source[source.index("  class CompanionConfig"):source.index("  # Number of threads")]),
        ("videojs", source[source.index("  struct VideoJSConfig"):source.index("  def disabled?")]),
        ("default_user_preferences", source[source.index("struct ConfigPreferences"):source.index("# Outbound proxy")]),
    ]
    for section, body in sections:
        text += f"## {section}\n\n| Key | Type | Code default |\n| --- | --- | --- |\n"
        for name, typ, default in property_rows(body):
            if name.startswith("ai_") and "{{" in name:
                continue
            text += f"| `{name}` | `{cell(typ or 'inferred')}` | `{cell(default or '—')}` |\n"
        if section == "default_user_preferences":
            for kind in ("blocklist", "warnlist"):
                for surface in ("feeds", "search", "recommendations", "other_pages"):
                    text += f"| `ai_{kind}_{surface}_action` | `String?` | `nil` |\n"
        text += "\n"
    text += ("`default_user_preferences.default_playlist` is annotated YAML-ignored and cannot seed a playlist through this structure. "
             "Runtime user `timezone` initializes to nil rather than copying the similarly named configuration field. "
             "See the [runtime preference expressions](preferences.md) for exact initialization.\n")
    text += ("\n## Jobs\n\n`jobs` is generated from `BaseJob` subclasses. Each structure has `enable: true`. "
             "The current startup path registers fresh job objects without assigning `CONFIG.jobs` to their `cfg`; "
             "the parsed nested values are therefore not an effective job-disable mechanism in this checkout. "
             "Use the documented top-level startup switches where provided. See [operations](../operations.md).\n")
    return text


def make_preferences():
    source = (ROOT / "src/invidious/user/preferences.cr").read_text()
    text = header("Preference fields", link("src/invidious/user/preferences.cr"))
    text += ("Preference defaults usually refer to `CONFIG.default_user_preferences`; that complete table is in [configuration defaults](configuration.md). "
             "This is a field inventory for the serialized model, not the narrower native PATCH allowlist. "
             "See [preferences](../preferences.md) and [native API](../mobile-api.md#safe-preference-updates) for normalization and update behavior.\n\n"
             "| Field | Type | Initial expression |\n| --- | --- | --- |\n")
    for name, typ, default in property_rows(source):
        text += f"| `{name}` | `{cell(typ or 'inferred')}` | `{cell(default or '—')}` |\n"
    for kind in ("blocklist", "warnlist"):
        text += f"| `ai_{kind}_action` | `String` | Legacy shared action; instance default |\n"
        for surface in ("feeds", "search", "recommendations", "other_pages"):
            text += f"| `ai_{kind}_{surface}` | `Bool` | Legacy page switch; instance default |\n"
            text += f"| `ai_{kind}_{surface}_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |\n"
    text += "\n`ai_filter_enabled` is stored as nullable internally but serializes its effective boolean. Canonical actions serialize their effective strings. Internal presence bookkeeping is excluded.\n"
    return text


def make_schema():
    text = header("SQL schema", "all files in " + link("config/sql"))
    text += ("Fresh-install DDL is reproduced exactly so every column, default, index, key and constraint is available here. "
             "This is a reference, not a migration script: some files contain non-idempotent type creation and order dependencies. "
             "Use the migration procedure in [database](../database.md). Runtime migrations also create tracking and subscription materialized views.\n\n")
    for path in sorted((ROOT / "config/sql").glob("*.sql")):
        text += f"## {path.stem}\n\nSource: {link(str(path.relative_to(ROOT)))}.\n\n```sql\n{path.read_text().rstrip()}\n```\n\n"
    return text


def make_migrations():
    text = header("Database migration inventory", link("src/invidious/database/migrations"))
    text += ("Every registered migration runs in its own transaction and records its version in `public.invidious_migrations`. "
             "Completed versions are skipped. There is no CLI down/rollback command. See [upgrade and restore](../operations.md).\n\n"
             "| Version | Migration | Implementation |\n| --- | --- | --- |\n")
    for path in sorted((ROOT / "src/invidious/database/migrations").glob("*.cr")):
        title = path.stem.split("_", 1)[1].replace("_", " ")
        version = re.search(r"^\s*version (\d+)", path.read_text(), re.M)
        if not version:
            raise ValueError(f"Missing migration version: {path}")
        text += f"| {version[1]} | {title.capitalize()} | {link(str(path.relative_to(ROOT)))} |\n"
    return text


def make_source_map():
    descriptions = {
        "src/invidious/routes/api": "JSON APIs, manifests and authenticated native contracts; see the API and route references.",
        "src/invidious/routes": "HTTP page handlers, authentication context, redirects, RSS and proxy handlers.",
        "src/invidious/database/migrations": "Versioned transactional schema changes.",
        "src/invidious/database": "PostgreSQL persistence, ownership checks, cache queries and migration infrastructure.",
        "src/invidious/views": "Server-rendered ECR pages and reusable UI components; see frontend documentation.",
        "src/invidious/frontend": "Presentation helpers for cards, filters, history, channels and page data.",
        "src/invidious/yt_backend": "YouTube Innertube requests, extraction, connection pooling, URL validation and outbound proxies.",
        "src/invidious/videos": "Video metadata, captions/transcripts, chapters, music, downloads and archived chat parsing.",
        "src/invidious/channels": "Channel metadata and tabs, community posts and upstream pagination.",
        "src/invidious/comments": "YouTube and Reddit comment parsing, content and safe link handling.",
        "src/invidious/search": "Query classification, filters, protobuf continuation construction and processors.",
        "src/invidious/user": "User models, credentials, cookies, preference converters, CAPTCHA and data exchange.",
        "src/invidious/jobs": "Long-running background refresh and cleanup fibers.",
        "src/invidious/helpers": "Shared rendering, errors, tokens, localization, logging and HTTP handlers.",
        "src/invidious/jsonify": "Public JSON serialization and channel-avatar enrichment.",
        "src/invidious/http_server": "HTTP utilities and static asset serving.",
        "src/invidious/clips": "Native clip range, timestamp and ID validation.",
        "src/invidious": "Domain models and cross-cutting integrations, configuration and routing.",
        "src/ext": "Kemal compatibility overrides.",
        "src": "Application entry point and startup wiring.",
        "assets/js": "Browser behavior; individual module responsibilities are described in frontend documentation.",
        "assets/css": "Base, player, feature and layout styles; minified third-party styles retain their upstream role.",
        "assets/themes": "Diary styling, with local fonts and SVG artwork alongside its stylesheet.",
        "scripts": "Build, dependency, database, release and Git-hook tooling.",
        "config/sql": "Fresh-install table/index/constraint definitions.",
        "config/migrate-scripts": "Historical shell migrations retained for legacy upgrades; not the modern migration runner.",
        "docker": "Image build and fresh-volume database initialization.",
        "nix": "Nix development shell and package definitions.",
        ".github/workflows": "CI, browser/database regression checks, container/release publishing and issue maintenance.",
    }
    paths = set()
    for base in ("src", "assets/js", "assets/css", "assets/themes", "scripts", "config/sql", "config/migrate-scripts", "docker", "nix", ".github/workflows"):
        for path in (ROOT / base).rglob("*"):
            if path.is_file() and path.suffix not in (".png", ".webp", ".ttf", ".svg"):
                paths.add(path.relative_to(ROOT))
    groups = {}
    for path in sorted(paths):
        group = next(key for key in descriptions if str(path).startswith(key + "/"))
        groups.setdefault(group, []).append(path)
    text = header("Source and asset map", "the first-party source tree, styles, browser modules and project tooling")
    text += (f"This inventory covers **{len(paths)} implementation and tooling files**. "
             "Names below describe each file's subject; directory introductions explain its role. "
             "Vendored `lib/` and `assets/videojs/`, translated locale JSON, binary artwork, mock data and generated test artifacts are described as families in [development](../development.md) and [frontend](../frontend.md). "
             "They are not expanded into duplicate source inventories.\n\n")
    for group, members in groups.items():
        text += f"## {group}\n\n{descriptions[group]}\n\n| File | Subject |\n| --- | --- |\n"
        for path in members:
            subject = path.stem.replace("_", " ").replace("-", " ")
            text += f"| {link(str(path))} | {subject} |\n"
    return text


def outputs():
    rows, methods = route_rows(), handlers()
    return {"routes.md": make_routes(rows, methods), "route-inputs.md": make_inputs(rows, methods),
            "configuration.md": make_config(), "preferences.md": make_preferences(),
            "schema.md": make_schema(), "migrations.md": make_migrations(), "source-map.md": make_source_map()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    failures = []
    for name, body in outputs().items():
        path = OUT / name
        if args.check:
            if not path.exists() or path.read_text() != body:
                failures.append(str(path.relative_to(ROOT)))
        else:
            path.write_text(body)
    if failures:
        print("Stale references: " + ", ".join(failures), file=sys.stderr)
        return 1
    print(f"{'Checked' if args.check else 'Generated'} 7 reference documents.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

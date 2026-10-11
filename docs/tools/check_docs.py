#!/usr/bin/env python3
"""Check local handbook links, anchors, reachability and generated-reference drift."""
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re
import subprocess
import sys

DOCS = Path(__file__).resolve().parents[1]
ROOT = DOCS.parent


def prose(text, errors, path):
    lines = []
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        match = re.match(r"^\s*(`{3,}|~{3,})", line)
        if match:
            marker = match[1][0]
            if fence is None:
                fence = (marker, number)
            elif fence[0] == marker:
                fence = None
        elif fence is None:
            lines.append(line)
    if fence:
        errors.append(f"{path.relative_to(ROOT)}:{fence[1]}: unclosed code fence")
    return "\n".join(lines)


def anchors(text):
    result = set()
    seen = {}
    for heading in re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", text, re.M):
        heading = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", heading)
        base = re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")
        count = seen.get(base, 0)
        seen[base] = count + 1
        result.add(base + (f"-{count}" if count else ""))
    return result


def main():
    errors = []
    files = sorted(DOCS.rglob("*.md"))
    texts = {path: prose(path.read_text(), errors, path) for path in files}
    edges = {path: set() for path in files}
    count = 0
    pattern = r"!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+\"[^\"]*\")?\)"
    for path, text in texts.items():
        for match in re.finditer(pattern, text):
            target = match[1].strip("<>")
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc:
                continue
            count += 1
            resolved = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path
            if not resolved.exists():
                errors.append(f"{path.relative_to(ROOT)}: missing link {target}")
                continue
            if resolved in edges:
                edges[path].add(resolved)
            if parsed.fragment and resolved.suffix == ".md":
                body = texts.get(resolved)
                if body is None:
                    body = prose(resolved.read_text(), errors, resolved)
                if unquote(parsed.fragment) not in anchors(body):
                    errors.append(f"{path.relative_to(ROOT)}: missing anchor {target}")
    reached = set()
    pending = [DOCS / "README.md"]
    while pending:
        current = pending.pop()
        if current in reached:
            continue
        reached.add(current)
        pending.extend(edges.get(current, ()))
    for path in files:
        if path not in reached:
            errors.append(f"{path.relative_to(ROOT)}: unreachable from docs/README.md")
    result = subprocess.run([sys.executable, str(DOCS / "tools/generate_reference.py"), "--check"], cwd=ROOT, check=False)
    if result.returncode:
        errors.append("Generated reference check failed")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Checked {len(files)} Markdown files, {count} local links/anchors, index reachability and reference coverage.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Validate the agent-produced digests and assemble the static site.

Run by CI on every push to `main` (code) or `data` (content). If ANY digest
fails validation the script exits non-zero, the workflow fails, and the
currently published site is left untouched. This is the deterministic gate
that sits between an LLM-produced file and what visitors actually load.
"""

import argparse
import json
import pathlib
import re
import shutil
import sys

import jsonschema

# Rejected anywhere in a string field: markup delimiters. The site renders
# with textContent so this is belt-and-braces, but it also catches a digest
# that has gone off the rails before anyone sees it.
MARKUP = re.compile(r"[<>]")

SITE_FILES = ["index.html"]
SITE_DIRS = ["assets"]


def fail(msg):
    print(f"::error::{msg}")
    sys.exit(1)


def walk_strings(node, path="$"):
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from walk_strings(value, f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from walk_strings(value, f"{path}[{index}]")


def load_digest(path, validator):
    try:
        digest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"{path.name}: invalid JSON ({exc})")

    errors = sorted(validator.iter_errors(digest), key=lambda e: e.path)
    if errors:
        first = errors[0]
        location = "/".join(str(p) for p in first.path) or "(root)"
        fail(f"{path.name}: schema violation at {location} — {first.message}")

    if digest["date"] != path.stem:
        fail(f"{path.name}: 'date' is {digest['date']}, expected {path.stem}")

    for location, value in walk_strings(digest):
        if MARKUP.search(value):
            fail(f"{path.name}: markup character in {location}")

    return digest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="directory holding YYYY-MM-DD.json digests")
    parser.add_argument("--out", required=True, help="directory to assemble the site into")
    args = parser.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    data_dir = pathlib.Path(args.data)
    out_dir = pathlib.Path(args.out)

    if not data_dir.is_dir():
        fail(f"data directory not found: {data_dir} (is the `data` branch checked out?)")

    schema = json.loads((root / "schema" / "digest.schema.json").read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema)

    digests = sorted(data_dir.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json"))
    unexpected = [
        p.name
        for p in data_dir.glob("*")
        # Dotfiles are housekeeping (.gitkeep holds the directory in git when
        # no edition exists yet); anything else does not belong here.
        if p not in digests and p.is_file() and not p.name.startswith(".")
    ]
    if unexpected:
        fail(f"unexpected file(s) on the data branch: {', '.join(sorted(unexpected))}")

    days = []
    for path in digests:
        digest = load_digest(path, validator)
        days.append(
            {
                "date": digest["date"],
                "count": len(digest["items"]),
                "summary": digest["summary"],
            }
        )
    days.sort(key=lambda d: d["date"], reverse=True)

    if out_dir.exists():
        shutil.rmtree(out_dir)
    (out_dir / "data").mkdir(parents=True)

    for name in SITE_FILES:
        shutil.copy2(root / name, out_dir / name)
    for name in SITE_DIRS:
        shutil.copytree(root / name, out_dir / name)
    for path in digests:
        shutil.copy2(path, out_dir / "data" / path.name)

    index = {"schema_version": 1, "days": days}
    (out_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"validated {len(digests)} digest(s); newest: {days[0]['date'] if days else 'none'}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build a deterministic Semgrep config from a pinned rules checkout."""

from pathlib import Path
import sys

from ruamel.yaml import YAML


ALLOWED_CONFIDENCE = {"MEDIUM", "HIGH"}
LANGUAGE_ROOTS = ("javascript", "typescript")


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "usage: select-semgrep-rules.py RULES_DIRECTORY OUTPUT_FILE",
            file=sys.stderr,
        )
        return 2

    source = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    yaml = YAML(typ="safe")
    selected: list[dict] = []
    seen_ids: set[str] = set()

    for language_root in LANGUAGE_ROOTS:
        root = source / language_root
        if not root.is_dir():
            raise RuntimeError(f"missing rules directory: {root}")

        for path in sorted((*root.rglob("*.yaml"), *root.rglob("*.yml"))):
            document = yaml.load(path.read_text(encoding="utf-8")) or {}
            for rule in document.get("rules", []):
                metadata = rule.get("metadata") or {}
                category = str(metadata.get("category", "")).upper()
                confidence = str(metadata.get("confidence", "")).upper()
                if category != "SECURITY" or confidence not in ALLOWED_CONFIDENCE:
                    continue

                rule_id = rule.get("id")
                if not rule_id:
                    raise RuntimeError(f"rule without id in {path}")
                if rule_id in seen_ids:
                    continue

                seen_ids.add(rule_id)
                selected.append(rule)

    if not selected:
        raise RuntimeError("no matching Semgrep rules were selected")

    output.parent.mkdir(parents=True, exist_ok=True)
    output_yaml = YAML()
    output_yaml.default_flow_style = False
    with output.open("w", encoding="utf-8") as stream:
        output_yaml.dump({"rules": selected}, stream)

    print(
        f"Selected {len(selected)} JavaScript/TypeScript security rules "
        "with MEDIUM or HIGH confidence."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

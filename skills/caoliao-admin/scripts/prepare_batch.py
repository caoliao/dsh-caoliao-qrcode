#!/usr/bin/env python3
"""Map local field aliases and names to one MCP prevalidation request. No network.

Python 3.10+, standard library. Input rows: [{item_key, name?, values:{alias:value}}].
Pass the saved templates_create response (data wrapper accepted) as --template.
For an existing template, supply a locally confirmed field_mapping in that snapshot.
"""
import argparse
import json
from pathlib import Path
import sys


class PreparationError(ValueError):
    """A safe diagnostic containing row number/reason, never business values."""


def prepare(template, rows, name_field=None, name_prefix="", category_id=0):
    for _ in range(3):
        if not isinstance(template, dict) or template.get("code", 0) != 0:
            raise PreparationError("invalid_template_response")
        if "template_id" in template:
            break
        template = template.get("data")
    if not isinstance(template, dict) or template.get("status", "succeeded") != "succeeded" or template.get("errors"):
        raise PreparationError("template_not_ready")
    mapping = template.get("field_mapping")
    if not isinstance(mapping, dict) or not mapping:
        raise PreparationError("missing_field_mapping")
    if any(not isinstance(k, str) or not k or not isinstance(v, str) or not v for k, v in mapping.items()):
        raise PreparationError("invalid_field_mapping")
    if len(set(mapping.values())) != len(mapping):
        raise PreparationError("duplicate_target_field")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
        raise PreparationError("batch_requires_1_to_100_rows")
    if name_prefix and not name_field:
        raise PreparationError("name_prefix_requires_name_field")
    items, seen = [], set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or set(row) - {"item_key", "name", "values"}:
            raise PreparationError(f"row_{index + 1}:invalid_row")
        key, values = row.get("item_key"), row.get("values")
        if not isinstance(key, str) or not 1 <= len(key) <= 128 or key in seen:
            raise PreparationError(f"row_{index + 1}:invalid_or_duplicate_item_key")
        if not isinstance(values, dict) or set(values) - set(mapping):
            raise PreparationError(f"row_{index + 1}:unmapped_field")
        name = row.get("name", "")
        if name_field:
            if "name" in row or not isinstance(values.get(name_field), str) or not values[name_field].strip():
                raise PreparationError(f"row_{index + 1}:name_source_must_be_text_without_explicit_name")
            name = name_prefix + values[name_field]
        if not isinstance(name, str) or len(name) > 100:
            raise PreparationError(f"row_{index + 1}:invalid_name")
        items.append({"item_key": key, "name": name, "values": {mapping[k]: v for k, v in values.items()}})
        seen.add(key)
    request = {k: template.get(k) for k in ("template_id", "template_version")}
    if any(not isinstance(v, str) or not 1 <= len(v) <= 128 for v in request.values()):
        raise PreparationError("missing_template_id_or_version")
    if type(category_id) is not int or category_id < 0:
        raise PreparationError("invalid_category_id")
    request.update(category_id=category_id, items=items)
    result = {"request": request}
    if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > 1024 * 1024:
        raise PreparationError("batch_exceeds_1MiB")
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--rows", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name-field")
    parser.add_argument("--name-prefix", default="")
    parser.add_argument("--category-id", type=int, default=0)
    args = parser.parse_args(argv)
    try:
        template = json.loads(args.template.read_text(encoding="utf-8-sig"))
        rows = json.loads(args.rows.read_text(encoding="utf-8-sig"))
        result = prepare(template, rows, args.name_field, args.name_prefix, args.category_id)
        # Don't overwrite a previously validated request or an input file.
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"ok": True, "count": len(rows), "next_action": "qrcodes_prevalidate"}))
        return 0
    except PreparationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError):
        print('{"ok":false,"error":"Check input mapping, row keys, name source and unused output path; no request submitted."}', file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

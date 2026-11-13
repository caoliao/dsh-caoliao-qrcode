"""Stage a publishable package; never performs a publish or network operation."""
import json
import shutil
from pathlib import Path
root = Path(__file__).resolve().parents[1]
source = root / "dist/dsh-caoliao-qrcode"
out = root / "dist/npm"
manifest = json.loads((root / "dist/build-manifest.json").read_text("utf-8"))
expected = set(manifest["package_files_sha256"])
if out.exists():
    extra = {p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()} - expected
    if extra:
        raise SystemExit(f"Unexpected files in npm staging: {sorted(extra)}")
for name in sorted(expected):
    target = out / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / name, target)
pkg = json.loads((out / "package.json").read_text("utf-8"))
pkg.pop("private", None)
pkg.pop("scripts", None)
pkg["publishConfig"] = {"access": "public", "registry": "https://registry.npmjs.org/"}
(out / "package.json").write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Staged {pkg['name']}@{pkg['version']} in {out}; nothing published")

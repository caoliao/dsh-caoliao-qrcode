"""Keep the committed Git-installable entry point in sync with the built plugin."""
import json
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
source = root / "dist/dsh-caoliao-qrcode"
check = "--check" in sys.argv
names = ("index.js", "oauth.js", "callback-page.js", "client.js", "client.css", "logo.png", "cordis.patch.yml")
for name in names:
    expected = (source / name).read_bytes()
    target = root / name
    if check:
        if not target.exists() or target.read_bytes() != expected:
            raise SystemExit(f"Stale Git plugin file: {name}; run npm run build")
    else:
        target.write_bytes(expected)
pkg = json.loads((root / "package.json").read_text("utf-8"))
built = json.loads((source / "package.json").read_text("utf-8"))
for key in ("name", "version", "main", "exports", "files", "dsh", "dependencies", "peerDependencies", "engines"):
    if pkg.get(key) != built.get(key):
        raise SystemExit(f"Root/plugin package metadata differ: {key}")
print("Git plugin files and metadata match the built bundle")

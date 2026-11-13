"""Prepare stable asset filenames for GitHub Releases and CI downloads."""
import hashlib
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text("utf-8"))["version"]
out = root / "dist/release"
out.mkdir(parents=True, exist_ok=True)
sources = {
    "dsh-caoliao-qrcode.tgz": f"dsh-caoliao-qrcode-{version}.tgz",
    "caoliao-registry-materials.zip": f"caoliao-registry-materials-{version}.zip",
    "build-manifest.json": "build-manifest.json",
}
for name, source in sources.items():
    shutil.copyfile(root / "dist" / source, out / name)
(out / "SHA256SUMS").write_text("".join(
    f"{hashlib.sha256((out / name).read_bytes()).hexdigest()}  {name}\n"
    for name in sorted(sources)
), encoding="utf-8")

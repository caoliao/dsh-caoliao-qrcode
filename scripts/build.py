"""Build the standalone plugin and Registry materials."""
import base64
import gzip
import hashlib
import io
import json
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"
NAMES = ("package.json", "index.js", "oauth.js", "callback-page.js", "client.js", "client.css", "logo.png", "cordis.patch.yml", "README.md", "LICENSE", "NOTICE.md", "BRANDING.md")
files = {name: (ROOT / "plugin" / name).read_bytes() for name in NAMES}
pkg = json.loads(files["package.json"])
assert pkg["private"] and pkg["version"] == json.loads((ROOT / "package.json").read_text("utf-8"))["version"]
client = files["client.js"].decode("utf-8")
client = client.replace("'__CAOLIAO_LOGO__'", json.dumps("data:image/png;base64," + base64.b64encode(files["logo.png"]).decode("ascii")))
client = client.replace("'__CAOLIAO_STYLES__'", json.dumps(files["client.css"].decode("utf-8"), ensure_ascii=False))
files["client.js"] = client.encode("utf-8")
files["skill-manifest.json"] = (ROOT / "skill-manifest.json").read_bytes()
assert json.loads(files["skill-manifest.json"])["version"] == pkg["version"]
for path in sorted((ROOT / "skills").rglob("*")):
    if path.is_file(): files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
target = OUT / pkg["name"]
if target.exists():
    extra = {p.relative_to(target).as_posix() for p in target.rglob("*") if p.is_file()} - set(files)
    if extra: raise ValueError("Foreign files in output: " + str(sorted(extra)))
for name, content in files.items():
    path = target / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
buffer = io.BytesIO()
with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0, filename="", compresslevel=9) as gz:
    with tarfile.open(fileobj=gz, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for name, content in sorted(files.items()):
            info = tarfile.TarInfo("package/" + name)
            info.size, info.mode, info.mtime = len(content), 0o644, 0
            tar.addfile(info, io.BytesIO(content))
archive = OUT / f"{pkg['name']}-{pkg['version']}.tgz"
archive.write_bytes(buffer.getvalue())
registry = OUT / "registry"
(registry / "connectors").mkdir(parents=True, exist_ok=True)
(registry / "assets").mkdir(parents=True, exist_ok=True)
(registry / "connectors/caoliao-qrcode.json").write_bytes((ROOT / "registry/caoliao-qrcode.json").read_bytes())
(registry / "assets/caoliao-qrcode.png").write_bytes(files["logo.png"])
for name in ("PR-BODY.md", "SUBMISSION.md"):
    (OUT / name).write_bytes((ROOT / "registry" / name).read_bytes())
manifest = {"plugin_version": pkg["version"], "skill_version": pkg["version"], "registry_material_version": pkg["version"],
    "source_skill_version": json.loads(files["skill-manifest.json"])["source_skill_version"],
    "package_files_sha256": {n: hashlib.sha256(c).hexdigest() for n, c in sorted(files.items())},
    "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "registry_sha256": hashlib.sha256((ROOT / "registry/caoliao-qrcode.json").read_bytes()).hexdigest(),
    "registry_assets_sha256": {"assets/caoliao-qrcode.png": hashlib.sha256(files["logo.png"]).hexdigest()}, "published": False}
(OUT / "build-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
with zipfile.ZipFile(OUT / f"caoliao-registry-materials-{pkg['version']}.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for name in ("PR-BODY.md", "SUBMISSION.md", "build-manifest.json", "registry/connectors/caoliao-qrcode.json", "registry/assets/caoliao-qrcode.png"):
        info = zipfile.ZipInfo(name, date_time=(2026, 11, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        bundle.writestr(info, (OUT / name).read_bytes())
print(archive)

"""Create a deterministic, verified ZIP using only Python's standard library."""
import hashlib
import json
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
dist = root / "dist"
manifest = json.loads((dist / "build-manifest.json").read_text())
version = manifest["version"]
names = ["Emergence-Atlas.html", "LICENSE", "README.txt", "build-manifest.json"]
for name, expected in manifest["files"].items():
    data = (dist / name).read_bytes()
    assert len(data) == expected["bytes"], f"Size mismatch: {name}"
    assert hashlib.sha256(data).hexdigest() == expected["sha256"], f"Checksum mismatch: {name}"

archive = dist / f"Emergence-Atlas-v{version}.zip"
prefix = f"Emergence-Atlas-v{version}/"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in names:
        info = zipfile.ZipInfo(prefix + name, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        info.create_system = 3
        z.writestr(info, (dist / name).read_bytes(), compresslevel=9)

with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert z.namelist() == [prefix + name for name in names]
    for name in names:
        assert z.read(prefix + name) == (dist / name).read_bytes()

assets = [archive.name, "Emergence-Atlas.html", "build-manifest.json"]
(dist / "SHA256SUMS.txt").write_text("".join(
    f"{hashlib.sha256((dist / name).read_bytes()).hexdigest()}  {name}\n" for name in assets
))
print(f"Packaged {archive.name} ({archive.stat().st_size:,} bytes); archive and checksums verified.")

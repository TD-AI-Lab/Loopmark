"""Bundle the extension source for addons.mozilla.org (no dependencies)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parents[1]
src = root / 'src'
manifest = json.loads((src / 'manifest.json').read_text(encoding='utf-8'))
version = manifest['version']
out = root / 'dist' / f'Loopmark_Firefox_v{version}.zip'
out.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(src.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(src))
print(out)

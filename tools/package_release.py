"""Package the current app beside its source: python tools/package_release.py.

Creates a versioned folder, ZIP and checksum manifest under ../releases.
Existing releases are never overwritten. No third-party dependencies required.
"""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    app = Path(__file__).resolve().parent.parent
    version = re.search(r"export const VERSION = '([\d.]+)'", (app / 'js/config.js').read_text(encoding='utf-8')).group(1)
    if f"VERSION  = 'v{version}'" not in (app / 'tools/build_docs.py').read_text(encoding='utf-8'):
        raise RuntimeError('Documentation builder version differs from app version')
    for page in (app / 'docs').glob('*.html'):
        if f'v{version}' not in page.read_text(encoding='utf-8'):
            raise RuntimeError(f'Rebuild documentation before packaging: {page.name}')
    releases = app.parent / 'releases'
    releases.mkdir(exist_ok=True)
    name = f'siteboard-v{version}'
    folder, archive, manifest = releases / name, releases / f'{name}.zip', releases / f'{name}.manifest.json'
    if any(p.exists() for p in (folder, archive, manifest)):
        raise RuntimeError('Release already exists; choose a new version or review the existing files')
    source_files = sorted(p for p in app.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    shell = (app / 'sw.js').read_text(encoding='utf-8')
    if f'const VERSION="{version}-' not in shell:
        raise RuntimeError('Rebuild offline shell before packaging')
    assets = json.loads(re.search(r'ASSETS=(\[.*?\]);', shell).group(1))
    fingerprint = hashlib.sha256(b''.join((app / p).read_bytes() for p in assets)).hexdigest()[:16]
    if f'{version}-{fingerprint}' not in shell:
        raise RuntimeError('Offline shell is stale; run tools/build_shell.py')
    entries = []
    for source in source_files:
        relative = source.relative_to(app)
        dest = folder / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
        sha = digest(source)
        if digest(dest) != sha:
            raise RuntimeError(f'Release copy mismatch: {relative}')
        entries.append({'path': relative.as_posix(), 'bytes': dest.stat().st_size, 'sha256': sha})
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as z:
        for entry in entries:
            z.write(folder / entry['path'], entry['path'])
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise RuntimeError('Archive CRC validation failed')
        for entry in entries:
            if hashlib.sha256(z.read(entry['path'])).hexdigest() != entry['sha256']:
                raise RuntimeError(f"Archive content mismatch: {entry['path']}")
    result = {'version': version, 'files': len(entries), 'zip': archive.name, 'zip_sha256': digest(archive), 'entries': entries}
    manifest.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k != 'entries'}, indent=2))

if __name__ == '__main__':
    main()

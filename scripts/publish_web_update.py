"""Create only public, deterministic full web bundles; never read credentials."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import zipfile

CHANNEL = 'liveai-stable'

def publish(source, destination, version):
    source, destination = Path(source), Path(destination)
    if not (source / 'index.html').is_file():
        raise ValueError('Web entry point is missing')
    destination.mkdir(parents=True, exist_ok=True)
    zipped = destination / 'bundle.partial'
    count = 0
    with zipfile.ZipFile(zipped, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob('*')):
            if not path.is_file():
                continue
            relative = path.relative_to(source).as_posix()
            if path.is_symlink() or not (relative in ['index.html', 'pcm-capture.js'] or relative.startswith('assets/')):
                raise ValueError('Unexpected web asset: ' + relative)
            if path.suffix not in ['.html', '.js', '.css', '.png', '.svg', '.webp', '.jpg', '.woff2']:
                raise ValueError('Unsupported web asset: ' + relative)
            content = path.read_bytes()
            if path.suffix in ['.js', '.html', '.css'] and re.search(rb'sk-[A-Za-z0-9]{30,}', content):
                raise ValueError('Potential API secret in web bundle')
            entry = zipfile.ZipInfo(relative, (2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, content)
            count += 1
    blob = zipped.read_bytes()
    if len(blob) > 12 * 1024 * 1024 or count > 1000:
        raise ValueError('Web bundle exceeds native limits')
    digest = hashlib.sha256(blob).hexdigest()
    zipped.replace(destination / (digest + '.zip'))
    manifest = {'version': version, 'channel': CHANNEL, 'sha256': digest, 'size': len(blob), 'minShellVersion': 1,
                'publishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    temporary = destination / 'latest.json.new'
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(destination / 'latest.json')
    return manifest

#!/usr/bin/env python3
import hashlib,json,shutil,zipfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=root/'browser-extension'
version=json.loads((source/'manifest.json').read_text())['version']
files=['manifest.json','background.js','content.js','offscreen.html','offscreen.js']
artifact=root/'artifacts'/'liveai-direct-extension.zip';artifact.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(artifact,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for name in files:
  info=zipfile.ZipInfo(name,(2026,11,5,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,(source/name).read_bytes())
directory=Path('/srv/liveai/apk');directory.mkdir(exist_ok=True,parents=True)
for name in ['liveai-direct-extension.zip',f'liveai-direct-extension-{version}.zip']:
 target=directory/name;temp=directory/(name+'.partial');shutil.copyfile(artifact,temp);temp.chmod(0o644);temp.replace(target)
 target.with_suffix('.zip.sha256').write_text(hashlib.sha256(artifact.read_bytes()).hexdigest()+'  '+name+'\n')
print('Browser extension packaged:',version,artifact.stat().st_size)

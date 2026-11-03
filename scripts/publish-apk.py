#!/usr/bin/env python3
"""Verify app identity, signature, version and digest before public APK release."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('apk',nargs='?',type=Path,default=root/'artifacts/liveai.apk')
parser.add_argument('--directory',type=Path,default=Path('/srv/liveai/apk'))
args=parser.parse_args()
config=json.loads((root/'android/release.json').read_text())
tools=Path('/opt/android-sdk/build-tools/36.0.0')
cert=subprocess.check_output([str(tools/'apksigner'),'verify','--print-certs',str(args.apk)],text=True)
assert 'Signer #1 certificate SHA-256 digest: '+config['certificateSha256'] in cert,'Unexpected signing certificate'
info=subprocess.check_output([str(tools/'aapt'),'dump','badging',str(args.apk)],text=True)
match=re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'",info)
assert match and match[1]==config['packageName'] and int(match[2])==config['versionCode'] and match[3]==config['versionName'],'APK identity/version mismatch'
blob=args.apk.read_bytes();digest=hashlib.sha256(blob).hexdigest()
directory=args.directory;directory.mkdir(parents=True,exist_ok=True)
archive=directory/f"liveai-android-{config['versionName']}.apk"
if archive.exists() and hashlib.sha256(archive.read_bytes()).hexdigest()!=digest:raise SystemExit('Existing version archive differs; increment the shell version')
latest=directory/'liveai-latest.apk'
previous=directory/'liveai-latest.apk.json'
if previous.exists():
    old=json.loads(previous.read_text())
    if old['sha256']!=digest and old['versionCode']>=config['versionCode']:raise SystemExit('Refusing shell downgrade or replacement without version increment')
for filename in [archive,latest]:
    tmp=filename.with_suffix('.apk.partial');tmp.write_bytes(blob);tmp.chmod(0o644);tmp.replace(filename)
    check=filename.with_suffix('.apk.sha256');tmp=check.with_suffix('.partial');tmp.write_text(f'{digest}  {filename.name}\n');tmp.chmod(0o644);tmp.replace(check)
manifest={**config,'sha256':digest,'size':len(blob),'downloadUrl':'https://guihualab.cn/liveai/downloads/'+archive.name}
temp=directory/'manifest.partial';temp.write_text(json.dumps(manifest,indent=2)+'\n');temp.chmod(0o644);temp.replace(previous)
print('http://42.192.115.30:8182/downloads/liveai/liveai-latest.apk')
print('SHA-256:',digest)

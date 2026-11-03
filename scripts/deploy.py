#!/usr/bin/env python3
"""Build/check, release atomically, restart only LiveAI, roll back on health failure."""
import datetime, json, os, pathlib, shutil, subprocess, time, urllib.request
from publish_web_update import publish
root = pathlib.Path(__file__).resolve().parent.parent
def run(args): subprocess.run(args,cwd=root,check=True)
run(['npm','test'])
run(['npm','run','build'])
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
base=pathlib.Path('/var/www/liveai'); release=base/'releases'/stamp
release.mkdir(parents=True)
for name in ['dist','server']: shutil.copytree(root/name,release/name)
for name in ['package.json','package-lock.json']:shutil.copy2(root/name,release/name)
manifest=publish(root/'dist',release/'web-updates',json.loads((root/'package.json').read_text())['version'])
(release/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
current=base/'current'; old=current.resolve() if current.exists() else None
# A tab may receive HTML immediately before the release switch and request its
# hashed JS/CSS immediately after. Keep assets from the current and four other
# recent releases so those in-flight loads still work. Manifests list only each
# release's own build output, preventing retained files from accumulating forever.
asset_dir=release/'dist'/'assets'
own_assets=[p.name for p in asset_dir.iterdir() if p.is_file()]
(release/'asset-manifest.json').write_text(json.dumps(own_assets))
previous=sorted((p for p in (base/'releases').iterdir() if p.is_dir() and p!=release and p!=old),reverse=True)[:4]
if old:previous.insert(0,old)
for previous_release in previous:
    updates=previous_release/'web-updates'
    if updates.is_dir():
        prior_manifest=updates/'latest.json'
        if prior_manifest.is_file():
            digest=json.loads(prior_manifest.read_text()).get('sha256','')
            if len(digest)==64 and all(c in '0123456789abcdef' for c in digest):
                item=updates/(digest+'.zip')
                if item.is_file() and not (release/'web-updates'/item.name).exists():shutil.copy2(item,release/'web-updates'/item.name)
    source=previous_release/'dist'/'assets'
    if not source.is_dir():continue
    manifest=previous_release/'asset-manifest.json'
    names=json.loads(manifest.read_text()) if manifest.exists() else [p.name for p in source.iterdir() if p.is_file()]
    for name in names:
        if pathlib.Path(name).name!=name:continue
        item=source/name;destination=asset_dir/name
        if item.is_file() and not destination.exists():shutil.copy2(item,destination)
def switch(path):
    target=base/'next'
    if target.is_symlink(): target.unlink()
    target.symlink_to(path,target_is_directory=True);os.replace(target,current)
switch(release)
run(['systemctl','restart','liveai.service'])
for _ in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:4260/api/health',timeout=2) as r:
            if json.load(r).get('ok'): print('LiveAI deployed:',release);break
    except Exception:time.sleep(.5)
else:
    if old:switch(old);run(['systemctl','restart','liveai.service'])
    raise SystemExit('Readiness failed; restored previous release when available')

#!/usr/bin/env python3
"""Build/check, release atomically, restart only LiveAI, roll back on health failure."""
import datetime, json, os, pathlib, shutil, subprocess, time, urllib.request
root = pathlib.Path(__file__).resolve().parent.parent
def run(args): subprocess.run(args,cwd=root,check=True)
run(['npm','test'])
run(['npm','run','build'])
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
base=pathlib.Path('/var/www/liveai'); release=base/'releases'/stamp
release.mkdir(parents=True)
for name in ['dist','server']: shutil.copytree(root/name,release/name)
for name in ['package.json','package-lock.json']:shutil.copy2(root/name,release/name)
(release/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
current=base/'current'; old=current.resolve() if current.exists() else None
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

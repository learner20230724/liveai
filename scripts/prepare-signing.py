#!/usr/bin/env python3
"""Provision a new independent signing identity once; never replace an old key."""
from pathlib import Path
import json
import os
import re
import secrets
import subprocess

root=Path(__file__).resolve().parent.parent
directory=Path('/etc/liveai')
key=directory/'android-release.p12'
password=directory/'android-signing-password'
if not key.exists():
    if password.exists():raise SystemExit('Password already exists; refusing to replace identity')
    fd=os.open(password,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(secrets.token_urlsafe(36)+'\n')
    subprocess.run(['keytool','-genkeypair','-keystore',str(key),'-storetype','PKCS12','-alias','liveai','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=LiveAI, O=Guihua Lab, C=CN','-storepass:file',str(password)],check=True)
    key.chmod(0o600)
output=subprocess.check_output(['keytool','-list','-v','-keystore',str(key),'-alias','liveai','-storepass:file',str(password)],text=True)
fingerprint=re.search(r'SHA256:\s*([0-9A-F:]+)',output).group(1).replace(':','').lower()
metadata=root/'android/release.json'
if metadata.exists():
    if json.loads(metadata.read_text())['certificateSha256']!=fingerprint:raise SystemExit('Existing public certificate does not match; identity unchanged')
else:
    metadata.write_text(json.dumps({'packageName':'cn.guihualab.liveai','versionCode':1,'versionName':'1.0.0','certificateSha256':fingerprint},indent=2)+'\n')
print('LiveAI signing identity ready; secrets remain outside the repository')

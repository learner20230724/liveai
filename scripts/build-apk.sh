#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
liveai_keystore="${LIVEAI_KEYSTORE:-/etc/liveai/android-release.p12}"
liveai_password="${LIVEAI_SIGNING_PASSWORD_FILE:-/etc/liveai/android-signing-password}"
liveai_tools="$ANDROID_HOME/build-tools/36.0.0"
test -r "$liveai_keystore"
test -r "$liveai_password"
mkdir -p artifacts
# A failed build must never leave a previous binary as this build's deliverable.
rm -f artifacts/liveai.apk artifacts/liveai.apk.idsig
npm run build
python3 - <<'PY'
from pathlib import Path
import shutil
dest=Path('android/app/src/main/assets/web')
if dest.exists():shutil.rmtree(dest)
shutil.copytree('dist',dest)
PY
./android/gradlew -p android :app:assembleRelease :app:lintRelease :app:testDebugUnitTest --offline --console=plain
mkdir -p artifacts
"$liveai_tools/zipalign" -f -p 4 android/app/build/outputs/apk/release/app-release-unsigned.apk artifacts/liveai-aligned.apk
"$liveai_tools/apksigner" sign --ks "$liveai_keystore" --ks-key-alias liveai --ks-pass "file:$liveai_password" --out artifacts/liveai.apk artifacts/liveai-aligned.apk
"$liveai_tools/apksigner" verify --verbose artifacts/liveai.apk
python3 - <<'PY'
import json,subprocess
config=json.load(open('android/release.json'))
cert=subprocess.check_output(['/opt/android-sdk/build-tools/36.0.0/apksigner','verify','--print-certs','artifacts/liveai.apk'],text=True)
assert 'Signer #1 certificate SHA-256 digest: '+config['certificateSha256'] in cert,'Wrong signing identity'
PY
sha256sum artifacts/liveai.apk

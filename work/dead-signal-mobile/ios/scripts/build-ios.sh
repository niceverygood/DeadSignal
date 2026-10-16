#!/bin/bash
set -euo pipefail

# Run from any directory. This script is copied to ios/scripts/build-ios.sh.
TASK_IOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_MODE="${1:-simulator}"
TASK_PROJECT="$TASK_IOS_ROOT/App/App.xcodeproj"
TASK_BUILD_ROOT="$TASK_IOS_ROOT/build"
TASK_LOG_DIR="$TASK_BUILD_ROOT/logs"

case "$TASK_MODE" in
  simulator|archive) ;;
  *) echo "Usage: $0 [simulator|archive]" >&2; exit 64 ;;
esac
if [[ ! -d "$TASK_PROJECT" ]]; then
  echo "Missing iOS project: run the mobile project preparation and Capacitor sync first." >&2
  exit 66
fi
python3 - "$TASK_IOS_ROOT/App/App/capacitor.config.json" "$TASK_PROJECT/project.pbxproj" "$TASK_IOS_ROOT/App/CapApp-SPM/Package.swift" <<'PY'
import json, pathlib, re, sys
p = pathlib.Path(sys.argv[1])
cfg = json.loads(p.read_text())
assert cfg.get('appId') == 'kr.bottlecorp.deadsignal', 'Unexpected bundle identifier'
server = cfg.get('server', {})
assert not server.get('url'), 'Remote server URL is not allowed in the offline release'
assert not server.get('allowNavigation'), 'External WebView bridge navigation is not allowed'
assert server.get('cleartext') is not True, 'Cleartext server access is not allowed'
assert cfg.get('ios', {}).get('webContentsDebuggingEnabled') is not True, 'Release WebView inspection must remain disabled'
versions = re.findall(r'IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);', pathlib.Path(sys.argv[2]).read_text())
assert len(versions) == 4 and set(versions) == {'16.0'}, 'The game requires iOS 16.0 or later in every project and app target configuration'
assert 'platforms: [.iOS(.v16)]' in pathlib.Path(sys.argv[3]).read_text(), 'Run Capacitor update ios to synchronize the iOS 16 Swift package platform'
print('Offline native configuration and iOS 16.0 minimum checks passed')
PY
mkdir -p "$TASK_LOG_DIR"
if [[ "$TASK_MODE" == simulator ]]; then
  xcodebuild -project "$TASK_PROJECT" -scheme App -configuration Debug \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$TASK_BUILD_ROOT/DerivedData-Simulator" \
    -clonedSourcePackagesDirPath "$TASK_BUILD_ROOT/SourcePackages" \
    -packageAuthorizationProvider netrc \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO DEVELOPMENT_TEAM= \
    build 2>&1 | tee "$TASK_LOG_DIR/simulator-build.log"
  echo "Simulator app: $TASK_BUILD_ROOT/DerivedData-Simulator/Build/Products/Debug-iphonesimulator/App.app"
else
  if [[ -d "$TASK_BUILD_ROOT/DeadSignal-1.0.0-1-unsigned.xcarchive" ]]; then
    echo "Archive already exists. Preserve it or choose a new version before rebuilding." >&2
    exit 73
  fi
  xcodebuild -project "$TASK_PROJECT" -scheme App -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$TASK_BUILD_ROOT/DeadSignal-1.0.0-1-unsigned.xcarchive" \
    -derivedDataPath "$TASK_BUILD_ROOT/DerivedData-Archive" \
    -clonedSourcePackagesDirPath "$TASK_BUILD_ROOT/SourcePackages" \
    -packageAuthorizationProvider netrc \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= DEVELOPMENT_TEAM= \
    archive 2>&1 | tee "$TASK_LOG_DIR/unsigned-archive.log"
  echo "Unsigned archive: $TASK_BUILD_ROOT/DeadSignal-1.0.0-1-unsigned.xcarchive"
  echo 'This archive still requires the matching Apple distribution identity and provisioning profile before App Store upload.'
fi

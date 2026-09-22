#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release/mac-arm64"

case "$MODE" in
  run|--debug|debug|--logs|logs|--telemetry|telemetry|--verify|verify)
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac

# Stop only the named application. Electron helper processes exit with it.
pkill -x Natively >/dev/null 2>&1 || true

cd "$ROOT_DIR"
node node_modules/typescript7/lib/tsc.js -p tsconfig.json --noEmit
node node_modules/typescript7/lib/tsc.js -p electron/tsconfig.json --noEmit
node node_modules/vite/bin/vite.js build
node scripts/build-electron.js
node scripts/package-app.js --mac --arm64 --dir

APP_BUNDLE="$(find "$RELEASE_DIR" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$APP_BUNDLE" ]]; then
  echo "No macOS app bundle was produced in $RELEASE_DIR" >&2
  exit 1
fi

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    open_app
    /usr/bin/log stream --style compact --info --predicate 'process == "Natively"'
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --style compact --info --predicate 'process == "Natively"'
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --style compact --info --predicate 'process == "Natively"'
    ;;
  --verify|verify)
    open_app
    for _ in {1..30}; do
      if pgrep -x Natively >/dev/null 2>&1; then
        echo "Natively is running: $APP_BUNDLE"
        exit 0
      fi
      sleep 1
    done
    echo "Natively did not stay running after launch" >&2
    exit 1
    ;;
esac

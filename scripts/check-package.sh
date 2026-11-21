#!/usr/bin/env bash
# Checks the npm package the way someone would use it: packed, installed into a fresh folder, and
# run from there (`cueboard demo`), with an empty home folder. It must hold only the built files,
# start without a key, serve the app, keep its key file in ~/.cueboard, and answer only this
# machine. CI runs it on every push, and on a release before publishing.
#   Usage: scripts/check-package.sh [port]
#   CUE_TARBALL=path/to/cueboard-x.y.z.tgz checks one packed already (say, with a newer Node than
#   the one running it now).
set -euo pipefail
port=${1:-5199}
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
pid=
fail() { echo "check-package: $*" >&2; exit 1; }
cleanup() { if [ -n "$pid" ]; then kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null || true; fi; rm -rf "$work"; }
trap cleanup EXIT

cd "$root"
if [ -n "${CUE_TARBALL:-}" ]; then cp "$CUE_TARBALL" "$work/"; tarball=$(basename "$CUE_TARBALL")
else tarball=$(npm pack --silent --pack-destination "$work" | tail -1); fi
echo "check-package: $tarball on Node $(node --version)"
files=$(tar -tzf "$work/$tarball" | sort | tr '\n' ' ')
want='package/LICENSE package/README.md package/dist/cli.mjs package/dist/cueboard.html package/dist/server.mjs package/package.json '
[ "$files" = "$want" ] || fail "the package holds the wrong files: $files"

mkdir -p "$work/app" "$work/home"
cd "$work/app"
npm install --silent --no-audit --no-fund "$work/$tarball" >/dev/null
[ ! -d node_modules/@anthropic-ai ] || fail "installing it installed dependencies too; they should be in the bundle"
bin=node_modules/.bin/cueboard
"$bin" --version | grep -qx "$(node -p "require('$root/package.json').version")" || fail "--version is wrong"
"$bin" --help | grep -q 'npx cueboard demo' || fail "--help is wrong"

# An empty home, and no keys: the demo has to work for someone who has nothing set up.
env -i PATH="$PATH" HOME="$work/home" "$bin" demo "$port" > "$work/log" 2>&1 &
pid=$!
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$port/healthz" >/dev/null && break; sleep 0.5; done
cat "$work/log"
curl -sf "http://127.0.0.1:$port/healthz" >/dev/null || fail "no answer on /healthz"
grep -q "the demo week" "$work/log" || fail "it didn't start the demo week"
# Read whole before searching: grep stopping early would cut curl off and fail the pipe.
page=$(curl -sf "http://localhost:$port/") && grep -q 'CueEngine' <<<"$page" || fail "the app page didn't load"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: cueboard.example.com" "http://127.0.0.1:$port/")" = 403 ] || fail "it answered a request meant for another address"
[ -f "$work/home/.cueboard/local.key" ] || fail "its key file isn't in ~/.cueboard"
[ ! -e "$work/app/node_modules/cueboard/data" ] || fail "it wrote into its own install folder"
echo "check-package: $tarball is fine"

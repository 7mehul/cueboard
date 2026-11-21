#!/usr/bin/env bash
# Checks a built Cueboard image keeps the README's promises: it doesn't run as root, it won't start
# open to the network without a password, and with one it starts, answers its health check and
# asks for the password before anything else. CI runs it on every push, and on a release before
# the image is published.   Usage: scripts/check-image.sh IMAGE
set -euo pipefail
image=${1:?usage: scripts/check-image.sh IMAGE}
name=cueboard-check-$$
url=http://127.0.0.1:5180
fail() { echo "check-image: $*" >&2; exit 1; }
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

[ "$(docker run --rm --entrypoint id "$image" -u)" != 0 ] || fail "it runs as root"

if docker run --rm "$image"; then fail "it started open to the network without a password"; fi

docker run -d --name "$name" -e CUE_PASSWORD=ci-only-password-0123 -p 127.0.0.1:5180:5180 "$image" >/dev/null
# Up to 90 seconds: an ARM image checked under emulation starts slowly.
for _ in $(seq 1 90); do curl -sf "$url/healthz" >/dev/null && break; sleep 1; done
docker logs "$name"
curl -sf "$url/healthz" >/dev/null || fail "no answer on /healthz"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-cueboard: 1' "$url/api/llm")" = 401 ] || fail "the API answered without the password"
page=$(curl -s "$url/") && grep -q 'type="password"' <<<"$page" || fail "the page didn't ask for the password"
echo "check-image: $image is fine"

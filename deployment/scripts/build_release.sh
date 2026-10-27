#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mode="${1:-display}"
case "$mode" in
  display) api_base='' ;;
  api) api_base='/api/component' ;;
  *) echo 'Usage: build_release.sh [display|api]' >&2; exit 2 ;;
esac
command -v node >/dev/null
test -f node_modules/vite/bin/vite.js || npm ci --no-audit --no-fund
VITE_COMPONENT_QUERY_API_BASE_URL="$api_base" VITE_COMPONENT_ID_API_URL='' \
  node node_modules/vite/bin/vite.js build
release_id="$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)-$mode"
release_dir="deployment/releases/$release_id"
mkdir -p "$release_dir/frontend" "$release_dir/deployment"
cp -R dist/. "$release_dir/frontend/"
cp -R deployment/nginx deployment/scripts "$release_dir/deployment/"
cp .env.production.example "$release_dir/deployment/"
cp README.md "$release_dir/README.md"
git rev-parse HEAD > "$release_dir/SOURCE_COMMIT"
printf '%s\n' "$mode" > "$release_dir/BUILD_MODE"
python3 - "$release_dir" <<'PY'
import hashlib, sys
from pathlib import Path
root = Path(sys.argv[1])
lines = []
for path in sorted(root.rglob('*')):
    if path.is_file():
        lines.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(root)}')
(root / 'SHA256SUMS').write_text('\n'.join(lines) + '\n')
PY
python3 - "$release_dir" <<'PY'
import sys, tarfile
from pathlib import Path
root = Path(sys.argv[1])
with tarfile.open(str(root) + '.tar.gz', 'w:gz') as archive:
    archive.add(root, arcname=root.name)
PY
printf 'Release: %s\nArchive: %s\n' "$release_id" "deployment/releases/$release_id.tar.gz"

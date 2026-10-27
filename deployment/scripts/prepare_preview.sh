#!/usr/bin/env bash
# 服务器执行：仅监听回环地址，不修改正式 Nginx 的 80/443 站点。
set -euo pipefail
release_dir="$(cd "$(dirname "$0")/../.." && pwd -P)"
case "$release_dir" in /srv/smartsluice/releases/*) ;; *) echo 'Extract under /srv/smartsluice/releases first' >&2; exit 2;; esac
cd "$release_dir"
sha256sum -c SHA256SUMS
test "$(cat BUILD_MODE)" = display
preview_dir=/srv/smartsluice/preview
mkdir -p "$preview_dir"
config="$preview_dir/nginx.conf"
if test -f "$preview_dir/nginx.pid" && kill -0 "$(cat "$preview_dir/nginx.pid")" 2>/dev/null; then
    echo 'Preview already running; stop it explicitly before preparing another release.' >&2
    exit 1
fi
cat > "$config" <<EOF
worker_processes 1;
user www-data;
pid $preview_dir/nginx.pid;
error_log $preview_dir/error.log;
events { worker_connections 256; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    access_log $preview_dir/access.log;
    server {
        listen 127.0.0.1:18080;
        server_name localhost;
        root $release_dir/frontend;
        include $release_dir/deployment/nginx/locations.conf;
    }
}
EOF
/usr/sbin/nginx -t -p "$preview_dir/" -c "$config"
/usr/sbin/nginx -p "$preview_dir/" -c "$config"
python3 "$release_dir/deployment/scripts/verify_http.py" \
  http://127.0.0.1:18080 --output "$preview_dir/http-verification.json"
printf 'Private preview ready: %s\n' "$release_dir"

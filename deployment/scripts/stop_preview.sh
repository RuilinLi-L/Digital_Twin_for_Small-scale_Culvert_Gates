#!/usr/bin/env bash
set -euo pipefail
preview_dir=/srv/smartsluice/preview
if test -f "$preview_dir/nginx.pid" && kill -0 "$(cat "$preview_dir/nginx.pid")" 2>/dev/null; then
    /usr/sbin/nginx -p "$preview_dir/" -c "$preview_dir/nginx.conf" -s quit
else
    echo 'Preview is already stopped.'
fi

#!/usr/bin/env python3
"""Verify the deployed frontend and save a repeatable HTTP acceptance report."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urljoin
from urllib.request import ProxyHandler, build_opener

parser = argparse.ArgumentParser()
parser.add_argument("base_url")
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
opener = build_opener(ProxyHandler({}))
checks = []


def check(path, status=200, content_type=None):
    url = args.base_url.rstrip("/") + quote(path, safe="/%?=&")
    try:
        response = opener.open(url, timeout=20)
    except HTTPError as error:
        response = error
    body = response.read()
    mime = response.headers.get("Content-Type", "")
    ok = response.code == status and (not content_type or content_type in mime)
    checks.append({"path": path, "status": response.code, "expected_status": status,
                   "content_type": mime, "bytes": len(body), "ok": ok,
                   "sha256": hashlib.sha256(body).hexdigest()})
    return body


html = check("/", content_type="text/html").decode()
assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
if not assets:
    raise RuntimeError("Built JavaScript/CSS references missing from index.html")
for asset in assets:
    check(asset, content_type="javascript" if asset.endswith(".js") else "text/css")
model_path = "/models/simple-test.gltf"
model = json.loads(check(model_path))
for resource in model.get("buffers", []) + model.get("images", []):
    uri = resource.get("uri", "")
    if uri and not uri.startswith("data:"):
        check(urljoin(model_path, uri))
for resource in ["draco_decoder.wasm", "draco_wasm_wrapper.js", "draco_decoder.js"]:
    check("/draco/gltf/" + resource)
health = json.loads(check("/__health", content_type="application/json"))
assert health["status"] == "ok"
check("/models/missing-deployment-check.bin", status=404)
check("/assets/missing-deployment-check.js", status=404)
check("/.env", status=404)
api = json.loads(check("/api/component/1", status=503, content_type="application/json"))
assert api["error"] == "backend_not_configured"
report = {"checked_at": datetime.now(timezone.utc).isoformat(), "base_url": args.base_url,
          "mode": "display", "passed": all(item["ok"] for item in checks),
          "checks": checks, "backend_configured": False}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"passed": report["passed"], "checks": len(checks),
                  "report": str(args.output)}, ensure_ascii=False))
raise SystemExit(0 if report["passed"] else 1)

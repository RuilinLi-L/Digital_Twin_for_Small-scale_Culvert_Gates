#!/usr/bin/env python3
r"""Repeatable HTTP acceptance checks for the independent Vercel deployment.

Failure modes covered: HTTP/JSON contract failures, invalid dates and input,
query injection, lost concurrent writes, incorrect component filters, UTC
timestamp changes, database failures leaking connection details, and records
disappearing after a restart or redeploy. No .env file is read.

Read-only deployment check (the default never sends POST):
  python3 deploy/verify-vercel.py --base-url http://127.0.0.1:3000 \
    --output .deployment/evidence/vercel-read.json

On a DEDICATED TEST DATABASE, create nine uniquely tagged records:
  python3 deploy/verify-vercel.py --base-url http://127.0.0.1:3000 \
    --write-test --phase seed --manifest /tmp/hanzha-test-manifest.json \
    --output .deployment/evidence/vercel-seed.json
Restart or rebuild the application with the SAME test database, then verify:
  python3 deploy/verify-vercel.py --base-url http://127.0.0.1:3000 \
    --phase check --manifest /tmp/hanzha-test-manifest.json \
    --output .deployment/evidence/vercel-after-restart.json

For an application deliberately started without DATABASE_URL (or with an
unreachable test database), add --expect-unavailable. Add --write-test to also
check the failed POST path. --phase all combines seed and immediate read-back;
only a separate check invocation after restart/redeploy proves persistence.

This script never deletes records, tables, or databases. The manifest contains
only this script's synthetic records, no database credentials. Use a dedicated
test database for --write-test; never use it against the real public project.
"""

import argparse
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


COMPONENTS = ("GATE-01", "HOIST-01", "PIER-L", "PIER-R", "CHAMBER-01", "BRIDGE-01")
STATUSES = ("正常", "待处理", "已处理")
FIELDS = {"id", "componentId", "inspectedAt", "inspector", "issue", "action", "status", "createdAt"}
LEAK = re.compile(
    r"postgres(?:ql)?://|DATABASE_URL|PGPASSWORD|connectionString|node_modules|"
    r"ECONNREFUSED|ENOTFOUND|CERT_HAS_EXPIRED|SELF_SIGNED_CERT|"
    r"\b(?:password|passwd)\s*[:=]|\bat\s+\S+\s+\(", re.I
)


class CheckFailure(Exception):
    pass


def require(condition, message):
    if not condition:
        raise CheckFailure(message)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def request(base, path, method="GET", payload=None, raw=None, timeout=30):
    body = raw
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Accept": "application/json", "User-Agent": "hanzha-http-acceptance/1.0"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=body, method=method, headers=headers)
    started = time.monotonic()
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=timeout) as response:
            status, response_headers = response.status, response.headers
            data = response.read(2 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as response:
        status, response_headers = response.code, response.headers
        data = response.read(2 * 1024 * 1024 + 1)
    except (urllib.error.URLError, TimeoutError, OSError):
        # A URL error can embed a connection string supplied by a remote server.
        raise CheckFailure("HTTP request could not complete; inspect application/network separately") from None
    require(len(data) <= 2 * 1024 * 1024, "Response exceeds 2 MiB acceptance limit")
    return {
        "status": status,
        "content_type": response_headers.get("Content-Type", ""),
        "body": data,
        "elapsed_ms": round((time.monotonic() - started) * 1000),
    }


def response_json(response, status):
    require(response["status"] == status, f"Expected HTTP {status}, received {response['status']}")
    require(response["content_type"].lower().startswith("application/json"), "Expected JSON content type")
    try:
        return json.loads(response["body"])
    except (ValueError, UnicodeError):
        raise CheckFailure("Response is not valid UTF-8 JSON") from None


def assert_error(response, status):
    data = response_json(response, status)
    require(isinstance(data, dict) and set(data) == {"error"}, "Expected generic error-only JSON response")
    require(isinstance(data["error"], str) and 0 < len(data["error"]) <= 300, "Expected concise error message")
    require(not LEAK.search(data["error"]), "Error response exposed database or stack details")
    if status == 503:
        require(data["error"] in {
            "记录暂时无法加载，请联系管理员检查数据库配置",
            "记录暂时无法保存，请稍后重试",
        }, "Database failure response must contain only the documented generic message")
    return {"http_status": status, "generic_error": True}


def assert_record(record):
    require(isinstance(record, dict) and set(record) == FIELDS, "Record fields do not match the API contract")
    try:
        require(uuid.UUID(record["id"]).version == 4, "Record ID must be a UUID v4")
    except (ValueError, TypeError, AttributeError):
        raise CheckFailure("Record ID must be a UUID v4") from None
    require(record["componentId"] in COMPONENTS, "Record has an unknown component")
    date = record["inspectedAt"]
    require(isinstance(date, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date), "Inspection date must remain YYYY-MM-DD")
    try:
        dt.date.fromisoformat(date)
    except ValueError:
        raise CheckFailure("Inspection date is not a real calendar day") from None
    require(record["status"] in STATUSES, "Record status is invalid")
    for key, minimum, maximum in (("inspector", 1, 40), ("issue", 2, 600), ("action", 2, 600)):
        value = record[key]
        require(isinstance(value, str) and minimum <= len(value) <= maximum, f"Invalid {key} field")
        require(value == value.strip(), f"Whitespace was not trimmed for {key}")
    created = record["createdAt"]
    require(isinstance(created, str) and created.endswith("Z"), "createdAt must use UTC with a Z suffix")
    try:
        stamp = dt.datetime.fromisoformat(created[:-1] + "+00:00")
    except ValueError:
        raise CheckFailure("createdAt is not an ISO timestamp") from None
    require(stamp.utcoffset() == dt.timedelta(0), "createdAt must remain UTC")


def records(response):
    data = response_json(response, 200)
    require(isinstance(data, dict) and set(data) == {"records"} and isinstance(data["records"], list), "Expected records array")
    values = data["records"]
    require(len(values) <= 100, "API exceeded its 100-record response limit")
    for record in values:
        assert_record(record)
    require(len({item["id"] for item in values}) == len(values), "Duplicate IDs in API response")
    dates = [dt.datetime.fromisoformat(item["createdAt"][:-1] + "+00:00") for item in values]
    require(dates == sorted(dates, reverse=True), "Records are not sorted by descending creation time")
    return values


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


class Run:
    def __init__(self, args):
        self.args = args
        self.report = {
            "schema_version": 1,
            "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "base_url": args.base_url,
            "phase": args.phase,
            "write_test": args.write_test,
            "expect_unavailable": args.expect_unavailable,
            "checks": [],
        }

    def check(self, name, operation):
        try:
            details = operation()
            result = {"name": name, "ok": True}
            if details is not None:
                result["details"] = details
        except CheckFailure as error:
            result = {"name": name, "ok": False, "error": str(error)}
        except Exception as error:
            # Do not put unexpected exception values, response bodies, or credentials in evidence.
            result = {"name": name, "ok": False, "error": f"Unexpected {type(error).__name__}; inspect application separately"}
        self.report["checks"].append(result)
        print(("PASS " if result["ok"] else "FAIL ") + name)
        return result["ok"]

    def get(self, query=""):
        return request(self.args.base_url, "/api/records" + query, timeout=self.args.timeout)

    def post(self, payload=None, raw=None):
        return request(self.args.base_url, "/api/records", "POST", payload, raw, self.args.timeout)

    def finish(self):
        checks = self.report["checks"]
        self.report.update({
            "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "passed": sum(item["ok"] for item in checks),
            "failed": sum(not item["ok"] for item in checks),
        })
        self.report["ok"] = self.report["failed"] == 0
        write_json(self.args.output, self.report)
        print(f"{self.report['passed']} passed, {self.report['failed']} failed; evidence: {self.args.output}")
        return 0 if self.report["ok"] else 1


def base_payload(tag, index=0):
    return {
        "componentId": COMPONENTS[index % len(COMPONENTS)],
        "inspectedAt": "2024-02-29" if index == 0 else "2026-10-27",
        "inspector": tag,
        "issue": f"{tag} 专用测试库检查 {index}；输入 ' OR 1=1 -- 作为普通文本保存。",
        "action": f"{tag} 验收样例 {index}，由测试环境保留，不属于真实工程记录。",
        "status": STATUSES[index % len(STATUSES)],
    }


def read_checks(run):
    def homepage():
        response = request(run.args.base_url, "/", timeout=run.args.timeout)
        require(response["status"] == 200, f"Homepage returned HTTP {response['status']}")
        require("text/html" in response["content_type"], "Homepage is not HTML")
        require("涵闸智维".encode() in response["body"], "Homepage does not contain the application title")
        return {"http_status": 200}
    run.check("homepage renders application HTML", homepage)
    if run.args.expect_unavailable:
        run.check("database unavailable GET returns generic 503", lambda: assert_error(run.get(), 503))
        run.check("database unavailable filtered GET returns generic 503", lambda: assert_error(run.get("?componentId=GATE-01"), 503))
    else:
        run.check("records contract, limit, UUIDs, calendar dates, UTC and sort order", lambda: {"record_count": len(records(run.get()))})
        for component in COMPONENTS:
            def check_filter(component=component):
                values = records(run.get("?" + urllib.parse.urlencode({"componentId": component})))
                require(all(item["componentId"] == component for item in values), "Filter returned another component's record")
                return {"record_count": len(values)}
            run.check(f"component filter {component}", check_filter)
    for name, component in (("unknown component", "DOES-NOT-EXIST"), ("SQL injection component", "GATE-01' OR 1=1 --"), ("script component", "<script>alert(1)</script>")):
        query = "?" + urllib.parse.urlencode({"componentId": component})
        run.check(f"GET rejects {name}", lambda query=query: assert_error(run.get(query), 400))


def invalid_write_checks(run):
    valid = base_payload("E2E-validation-only")
    run.check("POST rejects malformed JSON", lambda: assert_error(run.post(raw=b"{"), 400))
    for name, payload in (("null body", None), ("array body", []), ("missing fields", {})):
        run.check(f"POST rejects {name}", lambda payload=payload: assert_error(run.post(raw=json.dumps(payload).encode()), 400))
    cases = [
        ("unknown component", "componentId", "DOES-NOT-EXIST"),
        ("SQL injection component", "componentId", "GATE-01' OR 1=1 --"),
        ("empty component", "componentId", ""),
        ("blank inspector", "inspector", "  "),
        ("inspector too long", "inspector", "x" * 41),
        ("issue too short", "issue", "x"),
        ("issue too long", "issue", "x" * 601),
        ("action too short", "action", "x"),
        ("action too long", "action", "x" * 601),
        ("unknown status", "status", "INVALID"),
        ("non-leap February 29", "inspectedAt", "2025-02-29"),
        ("February 30", "inspectedAt", "2026-02-30"),
        ("April 31", "inspectedAt", "2026-04-31"),
        ("invalid month", "inspectedAt", "2026-13-01"),
        ("zero year", "inspectedAt", "0000-01-01"),
        ("zero day", "inspectedAt", "2026-10-00"),
        ("timestamp instead of date", "inspectedAt", "2026-10-27T12:00:00Z"),
        ("unpadded date", "inspectedAt", "2026-1-1"),
        ("SQL injection date", "inspectedAt", "2026-10-27'; DROP TABLE maintenance_records;--"),
    ]
    for name, field, value in cases:
        payload = {**valid, field: value}
        run.check(f"POST rejects {name}", lambda payload=payload: assert_error(run.post(payload), 400))


def seed(run):
    manifest_path = Path(run.args.manifest)
    require(not manifest_path.exists(), "Manifest already exists; use a new path instead of overwriting a prior test run")
    tag = "E2E-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
    manifest = {"schema_version": 1, "tag": tag, "created_at": dt.datetime.now(dt.timezone.utc).isoformat(), "complete": False, "records": []}
    write_json(manifest_path, manifest)

    def create(index):
        payload = base_payload(tag, index)
        # Leading/trailing spaces on the first record must be normalized by the API.
        submitted = {**payload, "inspector": "  " + tag + "  "} if index == 0 else payload
        data = response_json(run.post(submitted), 201)
        require(isinstance(data, dict) and set(data) == {"record"}, "Expected created record response")
        record = data["record"]
        assert_record(record)
        require(all(record[key] == value for key, value in payload.items()), "Created record changed submitted data or its date")
        require(abs((dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(record["createdAt"][:-1] + "+00:00")).total_seconds()) < 300, "Created timestamp is not near the current UTC time")
        return record

    def save_created(record):
        manifest["records"].append(record)
        write_json(manifest_path, manifest)
        return {"id": record["id"]}

    run.check("POST accepts leap day and trims inspector", lambda: save_created(create(0)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(create, index): index for index in range(1, 9)}
        for future in concurrent.futures.as_completed(futures):
            index = futures[future]
            run.check(f"concurrent POST {index}/8", lambda future=future: save_created(future.result()))
    manifest["complete"] = len(manifest["records"]) == 9
    write_json(manifest_path, manifest)
    run.report["manifest"] = str(manifest_path)
    run.report["test_tag"] = tag
    require(manifest["complete"], "Seed did not create all nine records; manifest preserves successful IDs for diagnosis")
    require(len({item["id"] for item in manifest["records"]}) == 9, "Concurrent requests returned duplicate IDs")


def check_manifest(run):
    try:
        manifest = json.loads(Path(run.args.manifest).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise CheckFailure("Cannot read a valid test manifest") from None
    require(isinstance(manifest, dict) and manifest.get("schema_version") == 1, "Unsupported test manifest")
    require(manifest.get("complete") is True and len(manifest.get("records", [])) == 9, "Manifest does not contain a completed nine-record seed")
    tag = manifest.get("tag")
    require(isinstance(tag, str) and tag.startswith("E2E-"), "Manifest does not identify this script's test data")
    for expected in manifest["records"]:
        assert_record(expected)
        require(expected["inspector"] == tag, "Manifest contains a record outside this test run")
    expected_by_id = {item["id"]: item for item in manifest["records"]}
    require(len(expected_by_id) == 9, "Manifest contains duplicate IDs")

    def match(values, expected):
        found = {item["id"]: item for item in values}
        require(set(expected).issubset(found), "Some seeded records are missing after read-back/restart")
        require(all(found[key] == record for key, record in expected.items()), "Seeded record data or UTC timestamps changed")
        return {"matched_test_records": len(expected)}

    run.check("all nine tagged records persist without lost concurrent writes", lambda: match(records(run.get()), expected_by_id))
    for component in COMPONENTS:
        expected = {key: value for key, value in expected_by_id.items() if value["componentId"] == component}
        def check_filter(component=component, expected=expected):
            values = records(run.get("?" + urllib.parse.urlencode({"componentId": component})))
            require(all(item["componentId"] == component for item in values), "Component filter leaked another component's record")
            return match(values, expected)
        run.check(f"persisted record filter {component}", check_filter)
    run.report["manifest"] = str(Path(run.args.manifest))
    run.report["test_tag"] = tag
    run.report["persistence_scope"] = "Read-back verified; restart/redeploy persistence requires this check invocation to follow the restart/redeploy."


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output", required=True, help="JSON evidence file; response bodies and credentials are never saved")
    parser.add_argument("--write-test", action="store_true", help="Authorize synthetic POST checks ONLY on a dedicated test database")
    parser.add_argument("--phase", choices=("read", "seed", "check", "all"), default="read")
    parser.add_argument("--manifest", help="Credential-free seed manifest; required for seed/check/all")
    parser.add_argument("--expect-unavailable", action="store_true", help="Expect database GET/POST to return generic 503 errors")
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args()
    url = urllib.parse.urlsplit(args.base_url)
    if url.scheme not in ("http", "https") or not url.netloc or url.username or url.password or url.query or url.fragment:
        parser.error("--base-url must be an HTTP(S) URL without credentials, query, or fragment")
    args.base_url = args.base_url.rstrip("/")
    if args.phase in ("seed", "all") and not args.write_test:
        parser.error("seed/all requires explicit --write-test and a dedicated test database")
    if args.phase != "read" and not args.manifest:
        parser.error("seed/check/all requires --manifest")
    if args.expect_unavailable and args.phase != "read":
        parser.error("--expect-unavailable is only compatible with --phase read")
    if args.manifest and Path(args.manifest).resolve() == Path(args.output).resolve():
        parser.error("--manifest and --output must use different files")
    if not 0 < args.timeout <= 300:
        parser.error("--timeout must be between 0 and 300 seconds")
    run = Run(args)
    read_checks(run)
    if args.write_test:
        invalid_write_checks(run)
        if args.expect_unavailable:
            run.check("database unavailable POST returns generic 503", lambda: assert_error(run.post(base_payload("E2E-unavailable")), 503))
    if args.phase in ("seed", "all"):
        run.check("seed manifest saved with nine unique records", lambda: seed(run))
    if args.phase in ("check", "all"):
        run.check("persistence manifest is valid", lambda: check_manifest(run))
    return run.finish()


if __name__ == "__main__":
    sys.exit(main())

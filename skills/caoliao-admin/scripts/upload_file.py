#!/usr/bin/env python3
"""Send local bytes using an MCP upload ticket. Python 3.10+, standard library only.

Descriptor-only counterpart of scripts/ai_qrcode_upload.py: no API credentials,
requests for tickets, retries, redirects or permanent-resource operations.
"""
from __future__ import annotations

import argparse
import http.client
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit


class UploadError(Exception):
    pass


def read_ticket(stream):
    raw = stream.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise UploadError("descriptor_too_large")
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8-sig")
    value = json.loads(raw.lstrip("\ufeff"))
    for _ in range(3):
        if not isinstance(value, dict) or value.get("code", 0) != 0:
            break
        if "file_key" in value:
            return value
        value = value.get("data")
    raise UploadError("invalid_ticket")


def upload(path: Path, ticket: dict, timeout=30):
    result = {"ok": False, "state": "not_sent", "needs_status_query": True,
              "next_action": "assets_get_upload"}
    started = False
    connection = None
    try:
        key = ticket.get("file_key")
        if not isinstance(key, str) or not re.fullmatch(r"free/[A-Za-z0-9_./-]+", key) or ".." in key:
            raise UploadError("invalid_file_key")
        result["file_key"] = key
        if ticket.get("state") == "temporary_available":
            result.update(ok=True, state="already_available")
            return result
        if ticket.get("state") != "uploading":
            raise UploadError("ticket_not_uploading")
        expires = ticket.get("upload_expires_at")
        if type(expires) not in (int, float) or expires <= time.time():
            raise UploadError("upload_credential_expired")
        descriptor = ticket["upload"]
        url = descriptor["url"]
        # urlsplit silently strips some control characters; reject before parsing.
        if not isinstance(url, str) or any(ord(c) <= 32 or ord(c) >= 127 for c in url):
            raise UploadError("invalid_upload_url")
        target = urlsplit(url)
        if (target.scheme != "https" or not target.hostname or target.username is not None
                or target.password is not None or target.fragment or descriptor.get("method") != "PUT"):
            raise UploadError("invalid_upload_descriptor")
        headers = descriptor["headers"]
        if not isinstance(headers, dict):
            raise UploadError("invalid_upload_headers")
        normalized = {}
        for name, value in headers.items():
            if (not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9-]+", name)
                    or not isinstance(value, str) or any(ord(c) < 32 or ord(c) > 126 for c in value)
                    or name.lower() in normalized
                    or name.lower() in {"authorization", "proxy-authorization", "cookie", "host", "transfer-encoding"}):
                raise UploadError("invalid_upload_headers")
            normalized[name.lower()] = value
        if not normalized.get("content-type"):
            raise UploadError("missing_content_type")
        if ticket.get("mime_type", normalized["content-type"]) != normalized["content-type"]:
            raise UploadError("upload_mime_mismatch")
        with path.open("rb") as stream:
            # Bounded by the service's existing 20 MiB limit; never encode the bytes.
            body = stream.read(20 * 1024 * 1024 + 1)
        if (not 0 < len(body) <= 20 * 1024 * 1024
                or normalized.get("content-length") != str(len(body))
                or ("size" in ticket and (type(ticket["size"]) is not int or ticket["size"] != len(body)))):
            raise UploadError("upload_size_mismatch")
        connection = http.client.HTTPSConnection(target.hostname, target.port or 443, timeout=timeout)
        started = True
        # Preserve query order, percent escapes and '+' exactly; no shell, URL encoding or redirect handler.
        request_target = (target.path or "/") + ("?" + target.query if "?" in url else "")
        connection.request("PUT", request_target, body=body, headers=headers)
        response = connection.getresponse()
        if not 200 <= response.status < 300:
            raise UploadError("storage_http_" + str(response.status))
        result.update(ok=True, state="bytes_sent_pending_verification")
    except UploadError as exc:
        result["error_code"] = str(exc)
    except (OSError, http.client.HTTPException):
        result["error_code"] = "storage_transport_failed" if started else "local_file_unavailable"
    except (KeyError, TypeError, ValueError):
        result["error_code"] = "invalid_upload_descriptor"
    finally:
        if connection is not None:
            connection.close()
    if not result["ok"] and started:
        result["state"] = "upload_outcome_unknown"
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--descriptor", type=Path, help="Temporary UTF-8 JSON file containing the MCP data/ticket")
    source.add_argument("--descriptor-stdin", action="store_true")
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args(argv)
    try:
        if not 0 < args.timeout <= 120:
            raise UploadError("invalid_timeout")
        if args.descriptor:
            with args.descriptor.open("rb") as stream:
                ticket = read_ticket(stream)
        else:
            ticket = read_ticket(getattr(sys.stdin, "buffer", sys.stdin))
        result = upload(args.file, ticket, args.timeout)
    except Exception:
        # Never echo exceptions containing a path, signed URL or storage response.
        result = {"ok": False, "error_code": "invalid_local_input", "state": "not_sent"}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

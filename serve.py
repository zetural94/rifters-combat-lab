#!/usr/bin/env python3
"""Local static server for the combat lab.

Binds 127.0.0.1 by default. CORS is limited to localhost origins.
POST /api/sandbox-log and /api/playtest append under logs/ only for
loopback clients, or for other clients when LAB_TOKEN matches X-Lab-Token.
There is no log_kpi import.
"""
from __future__ import annotations

import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
MAX_BODY = int(os.environ.get("MAX_BODY_BYTES", str(512 * 1024)))
LAB_TOKEN = os.environ.get("LAB_TOKEN", "")
LOCAL_ORIGIN = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


class LabHandler(SimpleHTTPRequestHandler):
    server_version = "RiftersLab/1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _client_ip(self) -> str:
        return self.client_address[0] if self.client_address else ""

    def _loopback(self) -> bool:
        return self._client_ip() in ("127.0.0.1", "::1")

    def _cors_origin(self):
        origin = self.headers.get("Origin")
        if origin and LOCAL_ORIGIN.match(origin):
            return origin
        return None

    def _send_cors(self) -> None:
        origin = self._cors_origin()
        if not origin:
            return
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Lab-Token")

    def end_headers(self) -> None:
        self._send_cors()
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def _write_allowed(self) -> bool:
        if self._loopback():
            return True
        token = self.headers.get("X-Lab-Token", "")
        return bool(LAB_TOKEN) and token == LAB_TOKEN

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            self._json(400, {"ok": False, "error": "bad length"})
            return None
        if length <= 0 or length > MAX_BODY:
            self._json(413 if length > MAX_BODY else 400, {"ok": False, "error": "body too large" if length > MAX_BODY else "empty body"})
            return None
        raw = self.rfile.read(length)
        if len(raw) > MAX_BODY:
            self._json(413, {"ok": False, "error": "body too large"})
            return None
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"ok": False, "error": "invalid json"})
            return None
        if not isinstance(data, dict):
            self._json(400, {"ok": False, "error": "expected object"})
            return None
        return data

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _append_log(self, name: str, record: dict) -> None:
        LOG_DIR.mkdir(exist_ok=True)
        # Fixed names only — never a client-supplied path.
        if name not in ("sandbox.jsonl", "playtests.jsonl"):
            raise ValueError(name)
        line = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        with (LOG_DIR / name).open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    def do_OPTIONS(self) -> None:
        if self._cors_origin() is None and self.headers.get("Origin"):
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self.end_headers()

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path not in ("/api/sandbox-log", "/api/playtest"):
            self._json(404, {"ok": False, "error": "not found"})
            return
        if not self._write_allowed():
            self._json(403, {"ok": False, "error": "log writes are localhost-only"})
            return
        data = self._read_json()
        if data is None:
            return
        if path == "/api/sandbox-log":
            self._append_log("sandbox.jsonl", data)
            self._json(200, {"ok": True, "file": "sandbox.jsonl", "latest": "sandbox.jsonl"})
            return
        self._append_log("playtests.jsonl", data)
        self._json(200, {"ok": True, "file": "playtests.jsonl"})


def main() -> None:
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer((HOST, PORT), LabHandler)
    print(f"Rifters lab  http://{HOST}:{PORT}/")
    print("Password gate is the site index. Ctrl+C to stop.")
    if HOST not in ("127.0.0.1", "::1", "localhost"):
        if not LAB_TOKEN:
            print("HOST is not loopback: POST /api/* is refused until LAB_TOKEN is set.")
        else:
            print("Non-loopback log writes require header X-Lab-Token.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()

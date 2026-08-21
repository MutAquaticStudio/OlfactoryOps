"""Private container entrypoint for the pinned model compatibility runtime.

The checked-in benchmark is deliberately not a tenant model registry. This
service therefore proves the bounded invocation and component provenance path,
but returns NOT_CONFIGURED for predictions until a reviewed model artifact is
registered by the V2 model service.
"""

from __future__ import annotations

import hmac
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MAX_BODY_BYTES = 65_536
PINS = json.loads(Path("/opt/model-component-pins.json").read_text(encoding="utf-8"))["components"]


class Handler(BaseHTTPRequestHandler):
    secret = os.environ.get("SCIENTIFIC_SERVICE_SHARED_SECRET", "")

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def respond(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self) -> bool:
        provided = self.headers.get("x-olfactoryops-scientific-key", "")
        return bool(self.secret) and hmac.compare_digest(provided, self.secret)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self.respond(HTTPStatus.OK, {"status": "ok", "runtimeVersion": "olfactoryops-model-runtime/1", "components": {key: pin["upstreamCommit"] for key, pin in PINS.items()}})
            return
        self.respond(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})

    def do_POST(self) -> None:  # noqa: N802
        if not self.authorized():
            self.respond(HTTPStatus.UNAUTHORIZED, {"error": "UNAUTHORIZED"})
            return
        try:
            size = int(self.headers.get("content-length", "0"))
            if size <= 0 or size > MAX_BODY_BYTES:
                raise ValueError
            payload = json.loads(self.rfile.read(size).decode("utf-8"))
            if not isinstance(payload, dict) or not isinstance(payload.get("jobId"), str) or not isinstance(payload.get("artifactRef"), str):
                raise ValueError
            if self.path != "/v1/jobs":
                self.respond(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})
                return
            self.respond(HTTPStatus.OK, {
                "resultArtifactRef": f"{payload['artifactRef']}/model-runtime",
                "payload": {"evidenceStatus": "NOT_CONFIGURED", "reason": "No reviewed tenant model artifact is registered for serving."},
                "runtimeVersion": "olfactoryops-model-runtime/1",
                "componentVersions": {key: pin["adapterVersion"] for key, pin in PINS.items()},
            })
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            self.respond(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "INVALID_SCIENTIFIC_REQUEST"})


def main() -> None:
    if not os.environ.get("SCIENTIFIC_SERVICE_SHARED_SECRET"):
        raise SystemExit("SCIENTIFIC_SERVICE_SHARED_SECRET must be configured")
    ThreadingHTTPServer((os.environ.get("SCIENTIFIC_SERVICE_HOST", "127.0.0.1"), int(os.environ.get("SCIENTIFIC_SERVICE_PORT", "8100"))), Handler).serve_forever()


if __name__ == "__main__":
    main()

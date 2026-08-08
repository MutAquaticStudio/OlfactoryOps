"""Private HTTP adapter for the isolated scientific runtime."""

from __future__ import annotations

import hmac
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .service import ComponentUnavailableError, InvalidSmilesError, ScientificRuntimeError, ScientificRuntimeService


MAX_BODY_BYTES = 1_048_576


class Handler(BaseHTTPRequestHandler):
    runtime = ScientificRuntimeService()
    shared_secret = os.environ.get("SCIENTIFIC_SERVICE_SHARED_SECRET", "")

    def log_message(self, _format: str, *_args: object) -> None:
        # Molecular structures and request headers are intentionally never logged here.
        return

    def _respond(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _authorized(self) -> bool:
        provided = self.headers.get("x-olfactoryops-scientific-key", "")
        return bool(self.shared_secret) and hmac.compare_digest(provided, self.shared_secret)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._respond(HTTPStatus.OK, {"status": "ok", "runtimeVersion": self.runtime.runtime_version})
            return
        self._respond(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            self._respond(HTTPStatus.UNAUTHORIZED, {"error": "UNAUTHORIZED"})
            return
        try:
            content_length = int(self.headers.get("content-length", "0"))
            if content_length <= 0 or content_length > MAX_BODY_BYTES:
                raise ScientificRuntimeError("SCIENTIFIC_RUNTIME_INVALID_REQUEST")
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ScientificRuntimeError("SCIENTIFIC_RUNTIME_INVALID_REQUEST")
            if self.path == "/v1/structure/normalize":
                result = self.runtime.normalize(str(payload.get("smiles", "")))
            elif self.path == "/v1/features/generate":
                kinds = payload.get("featureKinds")
                if not isinstance(kinds, list) or not all(isinstance(value, str) for value in kinds):
                    raise ScientificRuntimeError("SCIENTIFIC_RUNTIME_INVALID_FEATURE_REQUEST")
                target_context = payload.get("targetContext")
                result = self.runtime.generate_features(str(payload.get("canonicalSmiles", "")), kinds, target_context if isinstance(target_context, dict) else None)
            else:
                self._respond(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})
                return
            self._respond(HTTPStatus.OK, result)
        except InvalidSmilesError:
            self._respond(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "INVALID_MOLECULAR_STRUCTURE"})
        except ComponentUnavailableError:
            self._respond(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "SCIENTIFIC_RUNTIME_NOT_CONFIGURED"})
        except ScientificRuntimeError:
            self._respond(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "INVALID_SCIENTIFIC_REQUEST"})
        except Exception:
            self._respond(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "SCIENTIFIC_RUNTIME_FAILED"})


def main() -> None:
    host = os.environ.get("SCIENTIFIC_SERVICE_HOST", "127.0.0.1")
    port = int(os.environ.get("SCIENTIFIC_SERVICE_PORT", "8099"))
    if not os.environ.get("SCIENTIFIC_SERVICE_SHARED_SECRET"):
        raise SystemExit("SCIENTIFIC_SERVICE_SHARED_SECRET must be configured for the private scientific runtime.")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()

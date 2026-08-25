"""Private, allow-listed research model runtime.

No request can select a filesystem path, URL, module, or architecture. The
single bundled research candidate is loaded lazily only after its evaluated
manifest and checkpoint hash pass verification.
"""

from __future__ import annotations

import hmac
import json
import os
import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MAX_BODY_BYTES = 65_536
PINS = json.loads(Path("/opt/model-component-pins.json").read_text(encoding="utf-8"))["components"]
DEFAULT_ARTIFACT_DIR = Path("/opt/olfactoryops-model-runtime/artifacts/osmo-dravnieks-transformer-cnn")
DEFAULT_UPSTREAM_DIR = Path("/opt/transformer-cnn")

sys.path.insert(0, str(DEFAULT_UPSTREAM_DIR / "transformer_cnn"))
sys.path.insert(0, "/opt/olfactoryops-model-runtime")


class PredictorCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._value = None

    def get(self):
        if self._value is None:
            with self._lock:
                if self._value is None:
                    from osmo_demo.train_candidate import load_predictor

                    artifact_dir = Path(os.environ.get("OSMO_RESEARCH_MODEL_ARTIFACT_DIR", str(DEFAULT_ARTIFACT_DIR)))
                    upstream_dir = Path(os.environ.get("OSMO_TRANSFORMER_CNN_DIR", str(DEFAULT_UPSTREAM_DIR)))
                    self._value = load_predictor(artifact_dir, upstream_dir)
        return self._value


PREDICTOR = PredictorCache()


class Handler(BaseHTTPRequestHandler):
    secret = os.environ.get("SCIENTIFIC_SERVICE_SHARED_SECRET", "")
    predictor = PREDICTOR

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
            if not isinstance(payload, dict):
                raise ValueError
            if self.path == "/v1/jobs":
                if not isinstance(payload.get("jobId"), str) or not isinstance(payload.get("artifactRef"), str):
                    raise ValueError
                self.respond(HTTPStatus.OK, {
                    "resultArtifactRef": f"{payload['artifactRef']}/model-runtime",
                    "payload": {"evidenceStatus": "NOT_CONFIGURED", "reason": "No generic tenant model loader is configured."},
                    "runtimeVersion": "olfactoryops-model-runtime/1",
                    "componentVersions": {key: pin["adapterVersion"] for key, pin in PINS.items()},
                })
                return
            if self.path != "/v1/predictions":
                self.respond(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})
                return
            self._predict(payload)
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            self.respond(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "INVALID_SCIENTIFIC_REQUEST"})

    def _predict(self, payload: dict[str, object]) -> None:
        allowed = {"modelVersionId", "canonicalSmiles", "requestedTargets"}
        if set(payload) - allowed:
            raise ValueError
        model_version = payload.get("modelVersionId")
        smiles = payload.get("canonicalSmiles")
        targets = payload.get("requestedTargets")
        if not isinstance(model_version, str) or not 1 <= len(model_version) <= 160:
            raise ValueError
        if not isinstance(smiles, str) or not 1 <= len(smiles) <= 4096:
            raise ValueError
        if targets is not None and (not isinstance(targets, list) or not 1 <= len(targets) <= 20 or len(set(targets)) != len(targets) or any(not isinstance(item, str) for item in targets)):
            raise ValueError
        try:
            manifest, encoder, head = self.predictor.get()
            if model_version != manifest["modelVersion"]:
                self.respond(HTTPStatus.CONFLICT, {"error": "MODEL_NOT_EVALUATED"})
                return
            from osmo_demo.train_candidate import predict_smiles

            self.respond(HTTPStatus.OK, predict_smiles(manifest, encoder, head, smiles, targets))
        except ValueError as error:
            code = str(error)
            if code in {"MODEL_NOT_EVALUATED", "CHECKPOINT_HASH_MISMATCH"}:
                self.respond(HTTPStatus.CONFLICT, {"error": code})
            elif code in {"INVALID_SMILES", "UNSUPPORTED_SMILES_VOCABULARY", "UNSUPPORTED_TARGET"}:
                self.respond(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": code})
            else:
                self.respond(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "MODEL_RUNTIME_NOT_CONFIGURED"})
        except (FileNotFoundError, ImportError, KeyError):
            self.respond(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "MODEL_RUNTIME_NOT_CONFIGURED"})


def main() -> None:
    if not os.environ.get("SCIENTIFIC_SERVICE_SHARED_SECRET"):
        raise SystemExit("SCIENTIFIC_SERVICE_SHARED_SECRET must be configured")
    ThreadingHTTPServer((os.environ.get("SCIENTIFIC_SERVICE_HOST", "127.0.0.1"), int(os.environ.get("SCIENTIFIC_SERVICE_PORT", "8100"))), Handler).serve_forever()


if __name__ == "__main__":
    main()

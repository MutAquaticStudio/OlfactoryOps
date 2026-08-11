from __future__ import annotations

import json
import os
import threading
import unittest
from unittest import mock
from http import HTTPStatus
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

os.environ.setdefault("SCIENTIFIC_SERVICE_SHARED_SECRET", "scientific-http-test-secret")

from scientific_runtime.server import Handler  # noqa: E402


class ScientificRuntimeHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.thread.join(timeout=5)
        cls.server.server_close()

    def request(self, payload: dict[str, object], key: str = "scientific-http-test-secret") -> tuple[int, dict[str, object]]:
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        encoded = json.dumps(payload).encode("utf-8")
        connection.request("POST", "/v1/jobs", body=encoded, headers={
            "content-type": "application/json",
            "content-length": str(len(encoded)),
            "x-olfactoryops-scientific-key": key,
        })
        response = connection.getresponse()
        decoded = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, decoded

    def test_private_feature_job_returns_a_bounded_artifact_payload(self) -> None:
        status, body = self.request({
            "jobId": "science-http-job-1",
            "artifactRef": "v2/org_1/scientific/input",
            "operation": "FEATURE_GENERATE",
            "canonicalSmiles": "CCO",
            "featureKinds": ["ECFP"],
        })
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(body["resultArtifactRef"], "v2/org_1/scientific/input/result")
        self.assertIn("payload", body)
        self.assertIn("runtimeVersion", body)

    def test_private_job_rejects_an_invalid_internal_secret(self) -> None:
        status, body = self.request({
            "jobId": "science-http-job-2",
            "artifactRef": "v2/org_1/scientific/input",
            "operation": "FEATURE_GENERATE",
            "canonicalSmiles": "CCO",
            "featureKinds": ["ECFP"],
        }, key="not-the-shared-secret")
        self.assertEqual(status, HTTPStatus.UNAUTHORIZED)
        self.assertEqual(body["error"], "UNAUTHORIZED")

    def test_private_job_fails_closed_when_no_runtime_secret_is_available(self) -> None:
        with mock.patch.dict(os.environ, {"SCIENTIFIC_SERVICE_SHARED_SECRET": ""}):
            status, body = self.request({
                "jobId": "science-http-job-3",
                "artifactRef": "v2/org_1/scientific/input",
                "operation": "FEATURE_GENERATE",
                "canonicalSmiles": "CCO",
                "featureKinds": ["ECFP"],
            })
        self.assertEqual(status, HTTPStatus.UNAUTHORIZED)
        self.assertEqual(body["error"], "UNAUTHORIZED")

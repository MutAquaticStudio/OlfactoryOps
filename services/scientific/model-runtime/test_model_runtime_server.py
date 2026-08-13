from __future__ import annotations

import json
import os
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

os.environ.setdefault("SCIENTIFIC_SERVICE_SHARED_SECRET", "model-http-test-secret")

from model_runtime_server import Handler  # noqa: E402


class ModelRuntimeHttpTests(unittest.TestCase):
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

    def test_private_model_job_is_truthfully_not_configured_without_a_reviewed_model(self) -> None:
        response, body = self.request({"jobId": "model-http-job-1", "artifactRef": "v2/org_1/scientific/input"})
        self.assertEqual(response, HTTPStatus.OK)
        self.assertEqual(body["payload"]["evidenceStatus"], "NOT_CONFIGURED")

    def request(self, payload: dict[str, object]) -> tuple[int, dict[str, object]]:
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        encoded = json.dumps(payload).encode("utf-8")
        connection.request("POST", "/v1/jobs", body=encoded, headers={
            "content-type": "application/json",
            "content-length": str(len(encoded)),
            "x-olfactoryops-scientific-key": "model-http-test-secret",
        })
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, body

    def test_parallel_private_jobs_preserve_each_artifact_reference(self) -> None:
        payloads = [
            {"jobId": f"model-parallel-{index}", "artifactRef": f"v2/org_parallel_{index}/scientific/input-{index}"}
            for index in range(16)
        ]
        with ThreadPoolExecutor(max_workers=len(payloads)) as executor:
            results = list(executor.map(self.request, payloads))

        self.assertEqual([status for status, _ in results], [HTTPStatus.OK] * len(payloads))
        self.assertEqual(
            {body["resultArtifactRef"] for _, body in results},
            {f"{payload['artifactRef']}/model-runtime" for payload in payloads},
        )
        self.assertTrue(all(body["payload"]["evidenceStatus"] == "NOT_CONFIGURED" for _, body in results))

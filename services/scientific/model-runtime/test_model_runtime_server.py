from __future__ import annotations

import json
import os
import threading
import unittest
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
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        payload = json.dumps({"jobId": "model-http-job-1", "artifactRef": "v2/org_1/scientific/input"}).encode("utf-8")
        connection.request("POST", "/v1/jobs", body=payload, headers={
            "content-type": "application/json",
            "content-length": str(len(payload)),
            "x-olfactoryops-scientific-key": "model-http-test-secret",
        })
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()
        self.assertEqual(response.status, HTTPStatus.OK)
        self.assertEqual(body["payload"]["evidenceStatus"], "NOT_CONFIGURED")

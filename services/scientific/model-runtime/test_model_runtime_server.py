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

    def request(self, payload: dict[str, object], path: str = "/v1/jobs", secret: str = "model-http-test-secret") -> tuple[int, dict[str, object]]:
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=30)
        encoded = json.dumps(payload).encode("utf-8")
        connection.request("POST", path, body=encoded, headers={
            "content-type": "application/json",
            "content-length": str(len(encoded)),
            "x-olfactoryops-scientific-key": secret,
        })
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, body

    def test_prediction_rejects_unauthorized_and_unbounded_input_without_loading_model(self) -> None:
        status, body = self.request({"modelVersionId": "candidate", "canonicalSmiles": "CCO"}, path="/v1/predictions", secret="wrong")
        self.assertEqual(status, HTTPStatus.UNAUTHORIZED)
        self.assertEqual(body, {"error": "UNAUTHORIZED"})
        status, body = self.request({"modelVersionId": "candidate", "canonicalSmiles": "CCO", "checkpointPath": "/tmp/unsafe"}, path="/v1/predictions")
        self.assertEqual(status, HTTPStatus.UNPROCESSABLE_ENTITY)
        self.assertEqual(body, {"error": "INVALID_SCIENTIFIC_REQUEST"})

    def test_prediction_uses_only_the_bundled_evaluated_research_model(self) -> None:
        status, body = self.request({"modelVersionId": "osmo-dravnieks-transformer-cnn/1.0.0", "canonicalSmiles": "CCO", "requestedTargets": ["regression_floral"]}, path="/v1/predictions")
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(body["modelStage"], "RESEARCH")
        self.assertEqual(body["evidenceStatus"], "EVALUATED_RESEARCH")
        self.assertEqual([item["targetKey"] for item in body["predictions"]], ["regression_floral"])
        status, body = self.request({"modelVersionId": "unregistered-model", "canonicalSmiles": "CCO"}, path="/v1/predictions")
        self.assertEqual(status, HTTPStatus.CONFLICT)
        self.assertEqual(body, {"error": "MODEL_NOT_EVALUATED"})

    def test_prediction_rejects_invalid_smiles_and_unsupported_targets(self) -> None:
        status, body = self.request({"modelVersionId": "osmo-dravnieks-transformer-cnn/1.0.0", "canonicalSmiles": "not-a-smiles"}, path="/v1/predictions")
        self.assertEqual(status, HTTPStatus.UNPROCESSABLE_ENTITY)
        self.assertEqual(body, {"error": "INVALID_SMILES"})
        status, body = self.request({"modelVersionId": "osmo-dravnieks-transformer-cnn/1.0.0", "canonicalSmiles": "CCO", "requestedTargets": ["regression_not_registered"]}, path="/v1/predictions")
        self.assertEqual(status, HTTPStatus.UNPROCESSABLE_ENTITY)
        self.assertEqual(body, {"error": "UNSUPPORTED_TARGET"})

    def test_prediction_rejects_oversized_request_before_model_inference(self) -> None:
        status, body = self.request({"modelVersionId": "osmo-dravnieks-transformer-cnn/1.0.0", "canonicalSmiles": "C" * 66_000}, path="/v1/predictions")
        self.assertEqual(status, HTTPStatus.UNPROCESSABLE_ENTITY)
        self.assertEqual(body, {"error": "INVALID_SCIENTIFIC_REQUEST"})

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


if __name__ == "__main__":
    unittest.main()

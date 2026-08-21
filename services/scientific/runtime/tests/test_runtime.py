import os
import json
import unittest
from pathlib import Path

from scientific_runtime.service import ScientificRuntimeService


class ScientificRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = ScientificRuntimeService()

    def test_rdkit_normalizes_a_pinned_fixture_deterministically(self) -> None:
        first = self.runtime.normalize("OCC")
        second = self.runtime.normalize("CCO")
        self.assertEqual(first["structure"]["canonicalSmiles"], "CCO")
        self.assertEqual(first["structure"]["structureHash"], second["structure"]["structureHash"])
        self.assertEqual(first["structure"]["outputHash"], second["structure"]["outputHash"])
        self.assertEqual(first["structure"]["molecularGraph"]["atoms"][0]["symbol"], "C")

    def test_invalid_smiles_is_not_converted_into_a_scientific_claim(self) -> None:
        with self.assertRaisesRegex(Exception, "INVALID_SMILES"):
            self.runtime.normalize("not a valid smiles %%%")

    def test_ecfp_is_reproducible_and_molftp_without_target_is_not_evaluated(self) -> None:
        first = self.runtime.generate_features("CCO", ["ECFP", "MOLFTP"])
        second = self.runtime.generate_features("CCO", ["ECFP", "MOLFTP"])
        self.assertEqual(first["artifacts"][0]["kind"], "ECFP")
        self.assertEqual(first["artifacts"][0]["status"], "VERIFIED")
        self.assertEqual(first["artifacts"][0]["contentHash"], second["artifacts"][0]["contentHash"])
        self.assertEqual(first["artifacts"][1]["status"], "NOT_EVALUATED")

    def test_native_component_unavailability_is_explicit_never_a_fallback(self) -> None:
        result = self.runtime.generate_features("CCO", ["BCFP", "OSMORDRED"])
        for artifact in result["artifacts"]:
            self.assertIn(artifact["status"], {"VERIFIED", "NOT_CONFIGURED"})
            if artifact["status"] == "NOT_CONFIGURED":
                self.assertIn("reason", artifact["payload"])

    def test_component_pins_are_immutable_and_complete(self) -> None:
        pins_path = Path(__file__).resolve().parents[1] / "component-pins.json"
        pins = json.loads(pins_path.read_text(encoding="utf-8"))["components"]
        self.assertEqual(set(pins), {"RDKIT", "RDKIT_PYPI", "BCFP", "MOLFTP", "OSMORDRED"})
        for component in pins.values():
            self.assertTrue(component["repository"].startswith("https://github.com/"))
            self.assertRegex(component["upstreamCommit"], r"^[0-9a-f]{40}$")
            self.assertNotIn("main", component["upstreamRef"].lower())
            self.assertTrue(
                component["upstreamRef"].startswith("commit:") or component["upstreamRef"].startswith("Release_"),
                "Pins must use an immutable commit reference or an immutable upstream release tag.",
            )
            for field in ("license", "adapterVersion", "runtimeVersion", "patchStatus", "compatibilityTest"):
                self.assertTrue(component[field])

    @unittest.skipUnless(os.environ.get("SCIENTIFIC_REQUIRE_NATIVE") == "1", "primary native adapter image is not active")
    def test_pinned_native_bcfp_is_available_in_the_primary_adapter_image(self) -> None:
        result = self.runtime.generate_features("CCO", ["BCFP"])
        self.assertEqual([artifact["status"] for artifact in result["artifacts"]], ["VERIFIED"])

    @unittest.skipUnless(os.environ.get("SCIENTIFIC_REQUIRE_OSMORDRED") == "1", "Osmordred adapter image is not active")
    def test_pinned_native_osmordred_is_available_in_its_isolated_adapter_image(self) -> None:
        result = self.runtime.generate_features("CCO", ["OSMORDRED"])
        self.assertEqual([artifact["status"] for artifact in result["artifacts"]], ["VERIFIED"])
        self.assertGreater(result["artifacts"][0]["payload"]["descriptorCount"], 0)


if __name__ == "__main__":
    unittest.main()

import ast
import unittest
from pathlib import Path

from material_intelligence_bulk_precheck import SheetData, SheetRow, PrecheckError, analyze_rows
from material_intelligence_global_rebuild_plan import (
    GLOBAL_REBUILD_DISPOSITIONS,
    build_global_rebuild_plan,
    collect_unique_identity_candidates,
    strict_dilution_from_name,
)


SOURCE_HASH = "0" * 64
HEADERS = (
    "No.",
    "Category",
    "Product Name",
    "CAS",
    "Active Ingredient Name",
    "Active Ingredient CAS",
    "Active Concentration (%)",
    "Carrier / Solvent",
    "Carrier CAS",
)


def source_result(
    number,
    classification,
    name,
    cas=None,
    *,
    conflicts=None,
    dilution_evidence=None,
):
    claims = [] if cas is None else [{"value": cas, "formatStatus": "VALID"}]
    return {
        "sourceRowId": f"Synthetic!{number}",
        "sourceRowNumber": number,
        "sourceCatalogNumber": number - 1,
        "inputName": name,
        "supplier": "Synthetic fixture supplier",
        "supplierProductCode": f"FIX-{number}",
        "sourceCategory": "Synthetic fixture category",
        "productClassification": classification,
        "sourceCasClaims": claims,
        "sourceCasRaw": cas,
        "conflictCodes": list(conflicts or []),
        "verifiedStructureCandidate": None,
        "dilutionSourceEvidence": dilution_evidence,
    }


def precheck(*rows):
    return {
        "source": {
            "fileName": "synthetic-fixture.xlsx",
            "fileSha256": SOURCE_HASH,
            "sheet": "Synthetic",
            "rowCount": len(rows),
        },
        "results": list(rows),
    }


def verified_identity(
    identity_id="identity-alpha",
    preferred_name="Synthetic Alpha",
    *,
    aliases=None,
    cas_numbers=None,
    inchi_key="AAAAAAAAAAAAAA-BBBBBBBBBB-C",
    status="ACTIVE",
    verification="VERIFIED",
):
    return {
        "identityId": identity_id,
        "preferredName": preferred_name,
        "aliases": list(aliases or []),
        "casNumbers": list(cas_numbers or []),
        "canonicalSmiles": "CCO",
        "isomericSmiles": "CCO",
        "inchi": "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3",
        "inchiKey": inchi_key,
        "molecularFormula": "C2H6O",
        "molecularWeight": 46.069,
        "exactMass": 46.041865,
        "structureHash": "1" * 64,
        "standardizationVersion": "synthetic-standardization-v1",
        "rdkitVersion": "synthetic-rdkit-v1",
        "evidenceRecords": [{
            "sourceKind": "AUTHORITATIVE_PUBLIC_DATABASE",
            "sourceRef": f"https://registry.example.test/{identity_id}",
            "sourceVersion": "synthetic-registry-v1",
            "contentHash": "2" * 64,
        }],
        "lifecycleStatus": status,
        "verificationStatus": verification,
    }


class StrictDilutionExtractionTests(unittest.TestCase):
    def test_accepts_only_anchored_explicit_percent_and_carrier(self):
        parsed = strict_dilution_from_name("SYNTHETIC ALPHA 10% DPG")
        self.assertEqual(parsed["activeName"], "SYNTHETIC ALPHA")
        self.assertEqual(parsed["activeConcentration"], 10)
        self.assertEqual(parsed["carrierName"], "DPG")
        self.assertIsNone(strict_dilution_from_name("SYNTHETIC ALPHA 10% DPG LOT A"))
        self.assertIsNone(strict_dilution_from_name("SYNTHETIC ALPHA 99% UNKNOWN SOLVENT"))

    def test_concentration_free_in_carrier_expression_is_not_merge_ready(self):
        result = source_result(2, "DILUTION", "SYNTHETIC ALPHA IN DPG")
        plan = build_global_rebuild_plan(
            precheck(result),
            [verified_identity(aliases=["SYNTHETIC ALPHA"])],
        )
        observation = plan["sourceObservations"][0]
        self.assertEqual(observation["disposition"], "REVIEW_REQUIRED")
        self.assertIn("DILUTION_CONCENTRATION_UNPROVEN", observation["reasonCodes"])

    def test_precheck_preserves_structured_and_name_claim_disagreement(self):
        row = SheetRow(2, (
            1,
            "Synthetic aroma chemicals",
            "SYNTHETIC ALPHA 10% DPG",
            "64-17-5",
            "SYNTHETIC BETA",
            "67-56-1",
            10,
            "DPG",
            "25265-71-8",
        ))
        analysis = analyze_rows(SheetData(HEADERS, (row,), tuple(0 for _ in HEADERS)))
        evidence = analysis["results"][0]["dilutionSourceEvidence"]
        self.assertEqual(evidence["extractionMode"], "STRUCTURED_COLUMNS")
        self.assertFalse(evidence["claimsAgree"])
        self.assertEqual(evidence["activeCasClaims"], [{"value": "67-56-1", "formatStatus": "VALID"}])


class GlobalSourceAccountingTests(unittest.TestCase):
    def test_every_row_has_one_disposition_and_non_candidates_skip_lookup(self):
        rows = (
            source_result(2, "NEAT_SUBSTANCE", "SYNTHETIC ALPHA", "64-17-5"),
            source_result(3, "DILUTION", "SYNTHETIC ALPHA 10% DPG"),
            source_result(4, "DILUTION", "SYNTHETIC ALPHA 1% ETHANOL"),
            source_result(5, "NATURAL", "SYNTHETIC NATURAL FIXTURE"),
            source_result(6, "UNDEFINED_MIXTURE", "SYNTHETIC MIXTURE FIXTURE"),
            source_result(7, "BASE", "SYNTHETIC BASE FIXTURE"),
            source_result(8, "UNKNOWN", "SYNTHETIC UNKNOWN FIXTURE"),
        )
        plan = build_global_rebuild_plan(
            precheck(*rows),
            [verified_identity(aliases=["SYNTHETIC ALPHA"], cas_numbers=["64-17-5"])],
        )
        dispositions = [item["disposition"] for item in plan["sourceObservations"]]
        self.assertEqual(dispositions, [
            "GLOBAL_CANONICAL_NEAT",
            "DILUTION_MERGED_TO_NEAT",
            "DILUTION_MERGED_TO_NEAT",
            "EXCLUDED_NATURAL",
            "DEFERRED_MIXTURE",
            "DEFERRED_BASE",
            "REVIEW_REQUIRED",
        ])
        self.assertEqual(plan["counts"]["SOURCE_ROWS"], 7)
        self.assertEqual(plan["counts"]["UNACCOUNTED_SOURCE_ROWS"], 0)
        self.assertEqual(sum(plan["dispositionCounts"].values()), 7)
        self.assertEqual(set(plan["dispositionCounts"]), set(GLOBAL_REBUILD_DISPOSITIONS))
        self.assertEqual(plan["counts"]["LOOKUP_CANDIDATE_SOURCE_ROW_COUNT"], 3)
        self.assertEqual(plan["counts"]["UNIQUE_LOOKUP_CANDIDATE_COUNT"], 1)
        self.assertEqual(plan["counts"]["DEDUPLICATED_LOOKUP_COUNT"], 2)
        self.assertEqual(plan["lookupPlan"]["candidates"][0]["sourceClassifications"], ["DILUTION", "NEAT_SUBSTANCE"])

    def test_neat_and_dilutions_resolve_to_one_global_canonical(self):
        rows = (
            source_result(2, "NEAT_SUBSTANCE", "SYNTHETIC ALPHA", "64-17-5"),
            source_result(3, "DILUTION", "SYNTHETIC ALPHA 10% DPG"),
            source_result(4, "DILUTION", "SYNTHETIC ALPHA 1% ETHANOL"),
        )
        plan = build_global_rebuild_plan(
            precheck(*rows),
            [verified_identity(aliases=["SYNTHETIC ALPHA"], cas_numbers=["64-17-5"])],
        )
        self.assertEqual(plan["counts"]["GLOBAL_CANONICAL_NEAT_COUNT"], 1)
        self.assertEqual(plan["counts"]["GLOBAL_DUPLICATE_CANONICAL_COUNT"], 0)
        canonical = plan["canonicalMaterials"][0]
        self.assertEqual(canonical["classification"], "NEAT_SUBSTANCE")
        self.assertEqual(canonical["sourceObservationIds"], ["Synthetic!2", "Synthetic!3", "Synthetic!4"])
        self.assertEqual({row["canonicalMaterialKey"] for row in plan["sourceObservations"]}, {canonical["canonicalMaterialKey"]})
        dilution_rows = [row for row in plan["sourceObservations"] if row["sourceProductClassification"] == "DILUTION"]
        self.assertTrue(all(row["dilutionScientificallyEligible"] is False for row in dilution_rows))

    def test_source_provenance_and_dilution_observation_are_retained(self):
        row = source_result(2, "DILUTION", "SYNTHETIC ALPHA 10% DPG")
        plan = build_global_rebuild_plan(
            precheck(row),
            [verified_identity(aliases=["SYNTHETIC ALPHA"])],
        )
        observation = plan["sourceObservations"][0]
        self.assertEqual(observation["sourceProvenance"]["sourceFileSha256"], SOURCE_HASH)
        self.assertEqual(observation["sourceProvenance"]["sourceRowId"], "Synthetic!2")
        self.assertEqual(observation["sourceProvenance"]["sourceInputName"], "SYNTHETIC ALPHA 10% DPG")
        self.assertEqual(observation["dilutionObservation"]["activeConcentration"], 10)
        self.assertEqual(observation["dilutionObservation"]["carrierName"], "DPG")

    def test_trailing_name_content_cannot_be_silently_stripped(self):
        row = source_result(2, "DILUTION", "SYNTHETIC ALPHA 10% DPG LOT A")
        plan = build_global_rebuild_plan(
            precheck(row),
            [verified_identity(aliases=["SYNTHETIC ALPHA"])],
        )
        observation = plan["sourceObservations"][0]
        self.assertEqual(observation["disposition"], "REVIEW_REQUIRED")
        self.assertIn("DILUTION_EXTRACTION_AMBIGUOUS", observation["reasonCodes"])
        self.assertEqual(plan["counts"]["GLOBAL_CANONICAL_NEAT_COUNT"], 0)

    def test_structured_dilution_links_only_through_verified_active_cas(self):
        evidence = {
            "extractionMode": "STRUCTURED_COLUMNS",
            "claimsAgree": True,
            "activeName": "SYNTHETIC ALPHA",
            "activeConcentration": 10,
            "activeCasClaims": [{"value": "64-17-5", "formatStatus": "VALID"}],
            "activeCasMalformed": False,
            "carrierName": "DPG",
            "carrierConcentration": 90,
            "carrierCasClaims": [],
            "carrierCasMalformed": False,
        }
        row = source_result(2, "DILUTION", "SYNTHETIC TRADE DILUTION", dilution_evidence=evidence)
        plan = build_global_rebuild_plan(
            precheck(row),
            [verified_identity("identity-alpha", "CANONICAL ALPHA", cas_numbers=["64-17-5"])],
        )
        observation = plan["sourceObservations"][0]
        self.assertEqual(observation["disposition"], "DILUTION_MERGED_TO_NEAT")
        self.assertEqual(observation["verifiedIdentityId"], "identity-alpha")
        self.assertFalse(observation["dilutionScientificallyEligible"])

    def test_structured_dilution_claim_conflict_fails_closed(self):
        evidence = {
            "extractionMode": "STRUCTURED_COLUMNS",
            "claimsAgree": False,
            "activeName": "SYNTHETIC ALPHA",
            "activeConcentration": 10,
            "activeCasClaims": [{"value": "64-17-5", "formatStatus": "VALID"}],
            "activeCasMalformed": False,
            "carrierName": "DPG",
            "carrierConcentration": 90,
            "carrierCasClaims": [],
            "carrierCasMalformed": False,
        }
        row = source_result(2, "DILUTION", "SYNTHETIC ALPHA 10% DPG", dilution_evidence=evidence)
        plan = build_global_rebuild_plan(
            precheck(row),
            [verified_identity(aliases=["SYNTHETIC ALPHA"], cas_numbers=["64-17-5"])],
        )
        observation = plan["sourceObservations"][0]
        self.assertEqual(observation["disposition"], "REVIEW_REQUIRED")
        self.assertIn("DILUTION_SOURCE_CLAIMS_CONFLICT", observation["reasonCodes"])

    def test_duplicate_source_row_identity_fails_closed(self):
        row = source_result(2, "NEAT_SUBSTANCE", "SYNTHETIC ALPHA")
        with self.assertRaisesRegex(PrecheckError, "GLOBAL_REBUILD_SOURCE_ROW_IDS_INVALID"):
            build_global_rebuild_plan(precheck(row, dict(row)), [])


class VerifiedIdentityResolutionTests(unittest.TestCase):
    def test_only_active_verified_structured_identity_can_link(self):
        rows = (
            source_result(2, "NEAT_SUBSTANCE", "SYNTHETIC ALPHA"),
            source_result(3, "NEAT_SUBSTANCE", "SYNTHETIC BETA"),
        )
        registry = [
            verified_identity("inactive-alpha", "SYNTHETIC ALPHA", status="ARCHIVED"),
            verified_identity("draft-beta", "SYNTHETIC BETA", verification="REVIEW_REQUIRED"),
        ]
        plan = build_global_rebuild_plan(precheck(*rows), registry)
        self.assertTrue(all(row["disposition"] == "REVIEW_REQUIRED" for row in plan["sourceObservations"]))
        self.assertEqual(plan["counts"]["IGNORED_NONACTIVE_OR_UNVERIFIED_IDENTITY_COUNT"], 2)
        self.assertEqual(plan["counts"]["GLOBAL_CANONICAL_NEAT_COUNT"], 0)

    def test_ambiguous_verified_name_requires_review(self):
        row = source_result(2, "NEAT_SUBSTANCE", "SHARED SYNTHETIC ALIAS")
        registry = [
            verified_identity("identity-one", "IDENTITY ONE", aliases=["SHARED SYNTHETIC ALIAS"]),
            verified_identity(
                "identity-two",
                "IDENTITY TWO",
                aliases=["SHARED SYNTHETIC ALIAS"],
                inchi_key="CCCCCCCCCCCCCC-DDDDDDDDDD-E",
            ),
        ]
        plan = build_global_rebuild_plan(precheck(row), registry)
        observation = plan["sourceObservations"][0]
        self.assertEqual(observation["disposition"], "REVIEW_REQUIRED")
        self.assertIn("VERIFIED_NAME_IDENTITY_AMBIGUOUS", observation["reasonCodes"])

    def test_strong_cas_resolves_an_ambiguous_name(self):
        row = source_result(2, "NEAT_SUBSTANCE", "SHARED SYNTHETIC ALIAS", "64-17-5")
        registry = [
            verified_identity("identity-one", "IDENTITY ONE", aliases=["SHARED SYNTHETIC ALIAS"], cas_numbers=["64-17-5"]),
            verified_identity(
                "identity-two",
                "IDENTITY TWO",
                aliases=["SHARED SYNTHETIC ALIAS"],
                cas_numbers=["67-56-1"],
                inchi_key="CCCCCCCCCCCCCC-DDDDDDDDDD-E",
            ),
        ]
        plan = build_global_rebuild_plan(precheck(row), registry)
        self.assertEqual(plan["sourceObservations"][0]["disposition"], "GLOBAL_CANONICAL_NEAT")
        self.assertEqual(plan["sourceObservations"][0]["verifiedIdentityId"], "identity-one")

    def test_incomplete_verified_identity_contract_fails_closed(self):
        row = source_result(2, "NEAT_SUBSTANCE", "SYNTHETIC ALPHA")
        broken = verified_identity()
        broken["canonicalSmiles"] = None
        with self.assertRaisesRegex(PrecheckError, "VERIFIED_ACTIVE_IDENTITY_CONTRACT_INCOMPLETE"):
            build_global_rebuild_plan(precheck(row), [broken])

    def test_duplicate_canonical_material_key_fails_closed(self):
        row = source_result(2, "NEAT_SUBSTANCE", "SYNTHETIC ALPHA")
        first = verified_identity("identity-one", "SYNTHETIC ALPHA")
        second = verified_identity(
            "identity-two",
            "SYNTHETIC BETA",
            inchi_key="CCCCCCCCCCCCCC-DDDDDDDDDD-E",
        )
        first["canonicalMaterialKey"] = "canonical-shared"
        second["canonicalMaterialKey"] = "canonical-shared"
        with self.assertRaisesRegex(PrecheckError, "VERIFIED_CANONICAL_MATERIAL_KEY_DUPLICATED"):
            build_global_rebuild_plan(precheck(row), [first, second])

    def test_candidates_are_deduplicated_before_resolution(self):
        rows = [
            source_result(2, "NEAT_SUBSTANCE", "SYNTHETIC ALPHA", "64-17-5"),
            source_result(3, "DILUTION", "SYNTHETIC ALPHA 10% DPG"),
            source_result(4, "NATURAL", "SYNTHETIC NATURAL FIXTURE"),
        ]
        lookup = collect_unique_identity_candidates(rows)
        self.assertEqual(lookup["lookupCandidateSourceRowCount"], 2)
        self.assertEqual(lookup["uniqueLookupCandidateCount"], 1)
        self.assertEqual(lookup["candidates"][0]["sourceRowIds"], ["Synthetic!2", "Synthetic!3"])


class PlannerSafetyContractTests(unittest.TestCase):
    def test_planner_has_no_remote_database_or_provider_imports(self):
        path = Path(__file__).with_name("material_intelligence_global_rebuild_plan.py")
        tree = ast.parse(path.read_text(encoding="utf-8"))
        forbidden = (
            "requests",
            "urllib",
            "http",
            "socket",
            "psycopg",
            "asyncpg",
            "sqlalchemy",
            "prisma",
            "boto",
            "cloudflare",
        )
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.append(node.module)
        self.assertFalse([name for name in imports if name.split(".")[0] in forbidden])

    def test_synthetic_tests_do_not_embed_the_real_workbook_identity(self):
        source = Path(__file__).read_text(encoding="utf-8")
        self.assertNotIn("Material_" + "Intelligence_Master", source)
        self.assertNotIn("a49" + "bede2", source)
        self.assertNotIn("Llu" + "ch", source)


if __name__ == "__main__":
    unittest.main()
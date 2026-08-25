import ast
import tempfile
import unittest
import zipfile
from pathlib import Path

from material_intelligence_bulk_precheck import (
    PrecheckError,
    SheetData,
    SheetRow,
    analyze_rows,
    build_counts,
    cas_checksum_valid,
    classify_product,
    dilution_from_name,
    read_xlsx_sheet,
    stable_json,
)


HEADERS = (
    "No.",
    "Category",
    "Product Name",
    "CAS",
    "Molecular Formula",
    "Canonical SMILES",
    "Isomeric SMILES",
    "InChI",
    "InChIKey",
    "Active Ingredient Name",
    "Active Concentration (%)",
    "Carrier / Solvent",
    "Evidence Type",
    "Source Confidence",
    "PubChem URL",
)


def source_row(row_number, number, category, name, cas="--", formula=None, smiles=None, evidence=None, confidence=None, url=None):
    return SheetRow(row_number, (
        number,
        category,
        name,
        cas,
        formula,
        smiles,
        None,
        None,
        None,
        None,
        None,
        None,
        evidence,
        confidence,
        url,
    ))


def sheet(*rows):
    return SheetData(HEADERS, tuple(rows), tuple(0 for _ in HEADERS))


def write_minimal_xlsx(path):
    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"""
    root_rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""
    workbook = """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Material Intelligence" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""
    workbook_rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"""
    worksheet = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:C3"/>
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>No.</t></is></c><c r="B1" t="inlineStr"><is><t>Category</t></is></c><c r="C1" t="inlineStr"><is><t>Product Name</t></is></c></row>
    <row r="2"><c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t>Synthetic aroma chemicals</t></is></c><c r="C2" t="str"><f>UPPER(&quot;vanillin&quot;)</f><v>VANILLIN</v></c></row>
  </sheetData>
</worksheet>"""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)


class XlsxReaderTests(unittest.TestCase):
    def test_reads_cached_formula_and_preserves_physical_blank_row(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.xlsx"
            write_minimal_xlsx(path)
            parsed = read_xlsx_sheet(path, "Material Intelligence")
        self.assertEqual(parsed.headers, ("No.", "Category", "Product Name"))
        self.assertEqual(len(parsed.rows), 2)
        self.assertEqual(parsed.rows[0].values[2], "VANILLIN")
        self.assertEqual(parsed.formula_counts[2], 1)
        self.assertEqual(parsed.rows[1].row_number, 3)
        self.assertEqual(parsed.rows[1].values, (None, None, None))

    def test_missing_source_fails_closed(self):
        with self.assertRaisesRegex(PrecheckError, "SOURCE_DATA_FILE_REQUIRED"):
            read_xlsx_sheet(Path("definitely-missing.xlsx"), "Material Intelligence")


class ClassificationTests(unittest.TestCase):
    def test_explicit_carrier_dilution_has_two_unverified_components(self):
        dilution = dilution_from_name("ETHYL VANILLIN 10% DPG")
        self.assertEqual(classify_product("ETHYL VANILLIN 10% DPG", "Synthetic aroma chemicals", dilution), "DILUTION")
        result = analyze_rows(sheet(source_row(2, 1, "Synthetic aroma chemicals", "ETHYL VANILLIN 10% DPG", "121-32-4 / 25265-71-8")))["results"][0]
        self.assertEqual(result["componentCount"], 2)
        self.assertEqual([item["role"] for item in result["componentPlan"]], ["ACTIVE", "CARRIER"])
        self.assertEqual(sum(item["concentration"] for item in result["componentPlan"]), 100)
        self.assertEqual(result["eligibilityPreview"], "NOT_ELIGIBLE")
        self.assertIn("DILUTION_PRODUCT", result["eligibilityReasonCodes"])

    def test_purity_percentage_without_carrier_is_not_a_dilution(self):
        self.assertIsNone(dilution_from_name("GERANIOL 98%"))
        self.assertEqual(classify_product("GERANIOL 98%", "Synthetic aroma chemicals", None), "NEAT_SUBSTANCE")

    def test_natural_and_base_remain_fail_closed(self):
        analysis = analyze_rows(sheet(
            source_row(2, 1, "Natural products", "BERGAMOT ITALY ESS. OIL", "8007-75-8"),
            source_row(3, 2, "Synthetic aroma chemicals", "CASSIS BASE 345 B"),
        ))["results"]
        self.assertEqual([item["productClassification"] for item in analysis], ["NATURAL", "BASE"])
        self.assertEqual([item["chemicalEntityAction"] for item in analysis], ["CREATE_COMPLEX", "CREATE_COMPLEX"])
        self.assertTrue(all(item["molecularIdentityAction"] == "NOT_APPLICABLE" for item in analysis))
        self.assertTrue(all(item["eligibilityPreview"] == "NOT_ELIGIBLE" for item in analysis))

    def test_formula_and_cas_do_not_create_structure_or_model_eligibility(self):
        result = analyze_rows(sheet(source_row(2, 1, "Synthetic aroma chemicals", "VANILLIN", "121-33-5", formula="C8H8O3")))["results"][0]
        self.assertEqual(result["sourceStructureClaimStatus"], "MISSING")
        self.assertEqual(result["molecularIdentityAction"], "NEEDS_AUTHORITATIVE_VERIFICATION")
        self.assertEqual(result["eligibilityPreview"], "ELIGIBLE_AFTER_VERIFICATION")
        self.assertIn("NO_STRUCTURE", result["eligibilityReasonCodes"])

    def test_rdkit_validator_is_not_loaded_when_structure_claims_are_absent(self):
        def forbidden_validator(_claim):
            raise AssertionError("validator should not be called")
        analyze_rows(sheet(source_row(2, 1, "Synthetic aroma chemicals", "VANILLIN", "121-33-5")), forbidden_validator)

    def test_valid_source_structure_is_only_a_candidate(self):
        def validator(_claim):
            return {"status": "VALID_NORMALIZABLE", "canonicalSmiles": "CCO", "inchiKey": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N"}
        result = analyze_rows(sheet(source_row(
            2, 1, "Synthetic aroma chemicals", "ETHANOL", "64-17-5", smiles="CCO",
            evidence="PUBLISHED", confidence="VERIFIED", url="https://pubchem.ncbi.nlm.nih.gov/compound/702",
        )), validator)["results"][0]
        self.assertEqual(result["chemicalEntityAction"], "CREATE_VERIFIED_CANDIDATE")
        self.assertEqual(result["molecularIdentityAction"], "NORMALIZE_VERIFIED_SOURCE_STRUCTURE")
        self.assertNotEqual(result["resolutionStatus"], "RESOLVED")

    def test_invalid_structure_isolated_for_review(self):
        def validator(_claim):
            return {"status": "INVALID", "canonicalSmiles": None, "inchiKey": None}
        result = analyze_rows(sheet(source_row(2, 1, "Synthetic aroma chemicals", "BROKEN", "64-17-5", smiles="(")), validator)["results"][0]
        self.assertEqual(result["chemicalEntityAction"], "REVIEW_REQUIRED")
        self.assertIn("INVALID_STRUCTURE_CLAIM", result["conflictCodes"])


class DuplicateAndAccountingTests(unittest.TestCase):
    def test_product_duplicate_and_identity_conflict_are_separate(self):
        analysis = analyze_rows(sheet(
            source_row(2, 1, "Synthetic aroma chemicals", "SAME NAME", "64-17-5"),
            source_row(3, 2, "Synthetic aroma chemicals", "same   name", "67-56-1"),
        ))
        counts = build_counts(analysis["results"], analysis["conflicts"])
        self.assertEqual(counts["DUPLICATE_GROUP_COUNT"], 1)
        self.assertEqual(counts["DUPLICATE_ROW_COUNT"], 2)
        self.assertEqual(counts["IDENTITY_CONFLICT_COUNT"], 1)
        self.assertEqual(counts["STRUCTURE_CONFLICT_GROUPS"], 0)

    def test_neat_and_dilution_are_distinct_products_despite_shared_active_cas(self):
        analysis = analyze_rows(sheet(
            source_row(2, 1, "Synthetic aroma chemicals", "ETHYL VANILLIN", "121-32-4"),
            source_row(3, 2, "Synthetic aroma chemicals", "ETHYL VANILLIN 10% DPG", "121-32-4 / 25265-71-8"),
        ))
        counts = build_counts(analysis["results"], analysis["conflicts"])
        self.assertEqual(counts["DUPLICATE_GROUP_COUNT"], 0)
        self.assertEqual(counts["CAS_COLLISION_GROUPS"], 1)
        self.assertTrue(all(item["chemicalEntityAction"] == "REVIEW_REQUIRED" for item in analysis["results"]))

    def test_accounting_and_output_are_deterministic(self):
        input_sheet = sheet(
            source_row(2, 1, "Synthetic aroma chemicals", "VANILLIN", "121-33-5"),
            source_row(3, 2, "Natural products", "ROSE OIL", "8007-01-0"),
        )
        first = analyze_rows(input_sheet)
        second = analyze_rows(input_sheet)
        self.assertEqual(stable_json(first), stable_json(second))
        counts = build_counts(first["results"], first["conflicts"])
        self.assertEqual(counts["SOURCE_ROW_COUNT"], 2)
        self.assertEqual(counts["DRY_RUN_RESULT_ROWS"], 2)
        self.assertEqual(sum(counts[f"{name}_COUNT"] for name in ("NEAT_SUBSTANCE", "DILUTION", "DEFINED_MIXTURE", "UNDEFINED_MIXTURE", "NATURAL", "BASE", "FORMULATION", "UNKNOWN")), 2)

    def test_cas_checksum_contract(self):
        self.assertTrue(cas_checksum_valid("64-17-5"))
        self.assertFalse(cas_checksum_valid("64-17-4"))


class SafetyContractTests(unittest.TestCase):
    def test_precheck_has_no_remote_or_database_imports(self):
        path = Path(__file__).with_name("material_intelligence_bulk_precheck.py")
        tree = ast.parse(path.read_text(encoding="utf-8"))
        forbidden = ("requests", "urllib", "http", "socket", "psycopg", "asyncpg", "sqlalchemy", "prisma", "boto", "cloudflare")
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.append(node.module)
        self.assertFalse([name for name in imports if name.split(".")[0] in forbidden])

    def test_only_preview_mode_exists(self):
        source = Path(__file__).with_name("material_intelligence_bulk_precheck.py").read_text(encoding="utf-8")
        self.assertIn('choices=("preview",)', source)
        self.assertNotIn("DATABASE_URL", source)
        self.assertNotIn("SUPABASE", source)
        self.assertNotIn("HYPERDRIVE", source)


if __name__ == "__main__":
    unittest.main()

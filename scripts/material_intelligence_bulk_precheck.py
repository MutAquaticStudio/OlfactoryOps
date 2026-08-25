#!/usr/bin/env python3
"""Deterministic, local-only Material Intelligence bulk-ingest precheck.

The command reads an external XLSX workbook, classifies every source row, and
writes review artifacts. It deliberately has no database or network client and
implements no write mode.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable
from xml.etree import ElementTree as ET


CONTRACT_VERSION = "material-intelligence-bulk-precheck/1.0.0"
POLICY_VERSION = "material-intelligence/1.0.0"
RDKIT_CONTRACT = "olfactoryops-rdkit-standardization/1.0.0"
DEFAULT_SHEET = "Material Intelligence"

PRODUCT_CLASSIFICATIONS = (
    "NEAT_SUBSTANCE",
    "DILUTION",
    "DEFINED_MIXTURE",
    "UNDEFINED_MIXTURE",
    "NATURAL",
    "BASE",
    "FORMULATION",
    "UNKNOWN",
)
CHEMICAL_ENTITY_ACTIONS = (
    "LINK_VERIFIED_EXISTING",
    "CREATE_VERIFIED_CANDIDATE",
    "CREATE_UNRESOLVED",
    "CREATE_COMPLEX",
    "REVIEW_REQUIRED",
    "NOT_APPLICABLE",
)
ENRICHMENT_ACTIONS = (
    "AUTHORITATIVE_LOOKUP_READY",
    "SUPPLIER_DOCUMENT_REQUIRED",
    "MANUAL_REVIEW_REQUIRED",
    "NO_SINGLE_MOLECULE_LOOKUP",
)

FIELD_ALIASES = {
    "source_selected": ("\u2605", "selected"),
    "source_number": ("no", "number", "source row", "source number"),
    "category": ("category", "material category", "product category"),
    "name": ("product name", "material name", "name", "trade name"),
    "trade_name": ("trade name",),
    "grade": ("grade", "product grade"),
    "notes": ("notes", "source notes"),
    "material_id": ("material id",),
    "identity_type": ("identity type",),
    "canonical_name": ("canonical name",),
    "iupac_name": ("iupac name",),
    "supplier": ("supplier", "supplier name", "manufacturer"),
    "supplier_product_code": ("supplier product code", "supplier code", "product code", "sku"),
    "cas": ("cas", "cas number", "cas no", "cas rn"),
    "einecs": ("einecs", "ec einecs"),
    "fema": ("fema",),
    "cas_normalized": ("cas normalized",),
    "fema_normalized": ("fema normalized",),
    "einecs_normalized": ("ec einecs normalized", "einecs normalized"),
    "pubchem_cid": ("pubchem cid",),
    "formula": ("molecular formula", "formula"),
    "molecular_weight": ("molecular weight g mol", "molecular weight", "mw"),
    "structure_image_url": ("structure image url",),
    "canonical_smiles": ("canonical smiles", "smiles"),
    "isomeric_smiles": ("isomeric smiles",),
    "inchi": ("inchi",),
    "inchikey": ("inchikey", "inchi key"),
    "active_name": ("active ingredient name", "active name"),
    "active_cas": ("active ingredient cas", "active cas"),
    "active_concentration": ("active concentration", "active concentration percent", "concentration"),
    "carrier": ("carrier solvent", "carrier", "solvent"),
    "carrier_cas": ("carrier cas", "solvent cas"),
    "physical_state": ("appearance physical state", "physical state", "appearance"),
    "density": ("density g ml", "density"),
    "melting_point": ("melting point c", "melting point"),
    "boiling_point": ("boiling point c", "boiling point"),
    "flash_point": ("flash point c", "flash point"),
    "refractive_index": ("refractive index",),
    "vapor_pressure": ("vapor pressure",),
    "solubility": ("solubility",),
    "logp": ("logp",),
    "tpsa": ("tpsa 2", "tpsa"),
    "h_bond_donors": ("h bond donors",),
    "h_bond_acceptors": ("h bond acceptors",),
    "rotatable_bonds": ("rotatable bonds",),
    "ring_count": ("ring count",),
    "aromatic_ring_count": ("aromatic ring count",),
    "odor_descriptors": ("odor profile descriptors", "odor description"),
    "primary_odor_family": ("primary odor family",),
    "secondary_odor_families": ("secondary odor families",),
    "odor_intensity": ("odor intensity",),
    "diffusion": ("diffusion",),
    "substantivity": ("substantivity tenacity", "tenacity"),
    "odor_threshold": ("odor threshold",),
    "functional_role": ("functional role",),
    "volatility_class": ("volatility class",),
    "polarity_class": ("polarity class",),
    "molecular_size_class": ("molecular size class",),
    "chemical_fingerprint_ref": ("chemical fingerprint ref",),
    "odor_embedding_ref": ("odor embedding ref",),
    "nearest_materials_ref": ("nearest materials ref",),
    "potential_substitutes_ref": ("potential substitutes ref",),
    "supplier_match": ("lluch match", "supplier match"),
    "evidence_type": ("evidence type",),
    "match_method": ("match method",),
    "source_confidence": ("source confidence", "confidence"),
    "conflict_flag": ("conflict flag",),
    "review_status": ("review status",),
    "review_notes": ("review notes",),
    "structure_status": ("structure status",),
    "last_enriched_utc": ("last enriched utc", "last enriched"),
    "supplier_url": ("lluch product url", "supplier product url", "supplier url"),
    "supplier_source_notes": ("lluch source notes", "supplier source notes"),
    "structure_url": ("sdf molfile source url", "structure source url"),
    "pubchem_url": ("pubchem url",),
    "additional_url": ("additional source url",),
}

NATURAL_CATEGORIES = {"NATURAL PRODUCTS", "ORGANIC PRODUCTS"}
NEAT_CATEGORIES = {"SYNTHETIC AROMA CHEMICALS", "NATURAL AROMA CHEMICALS"}
BASE_PATTERN = re.compile(r"\b(?:FRAGRANCE\s+BASE|BASE)\b", re.IGNORECASE)
MIXTURE_PATTERN = re.compile(r"\b(?:MIX|MIXTURE|BLEND|ACCORD|COMPOUND|COMPOSITION)\b", re.IGNORECASE)
FORMULATION_PATTERN = re.compile(r"\b(?:FORMULA|FORMULATION)\b", re.IGNORECASE)
NATURAL_NAME_PATTERN = re.compile(r"\b(?:ESSENTIAL\s+OIL|ABSOLUTE|RESINOID|EXTRACT|OLEORESIN|CONCRETE)\b", re.IGNORECASE)
PERCENT_PATTERN = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)\s*%")
CARRIER_NAMES = (
    "DOWANOL TPM",
    "GRAPEFRUIT OIL",
    "CASTOR OIL",
    "IPM-TEC",
    "ETHANOL",
    "WATER",
    "DPG",
    "TEC",
    "IPM",
    "DEP",
    "ETOH",
    "H2O",
    "PG",
    "BB",
)
CARRIER_PATTERN_TEXT = "|".join(re.escape(item) for item in CARRIER_NAMES)
DILUTION_PATTERN = re.compile(
    rf"^(?P<active>.+?)\s+(?P<percent>\d+(?:[.,]\d+)?)\s*%\s+(?P<carrier>{CARRIER_PATTERN_TEXT})(?=$|\s|\()",
    re.IGNORECASE,
)
IN_CARRIER_PATTERN = re.compile(
    rf"^(?P<active>.+?)\s+IN\s+(?P<carrier>{CARRIER_PATTERN_TEXT})(?=$|\s|\()",
    re.IGNORECASE,
)
CAS_PATTERN = re.compile(r"(?<!\d)(\d{2,7}-\d{2}-\d)(?!\d)")
CAS_ALLOWED_RESIDUE_PATTERN = re.compile(r"^[\s/;,|()\[\]{}]*$")
INCHIKEY_PATTERN = re.compile(r"^[A-Z]{14}-[A-Z]{10}-[A-Z]$")
MISSING_MARKERS = {"", "--", "-", "N/A", "NA", "NONE", "NULL", "PENDING", "UNVERIFIED", "NOT AVAILABLE"}
INGEST_WAVES = ("Wave A", "Wave B", "Wave C", "Wave D", "Wave E")

XML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


class PrecheckError(RuntimeError):
    pass


@dataclass(frozen=True)
class SheetRow:
    row_number: int
    values: tuple[Any, ...]


@dataclass(frozen=True)
class SheetData:
    headers: tuple[str, ...]
    rows: tuple[SheetRow, ...]
    formula_counts: tuple[int, ...]


def normalized_header(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return " ".join(re.findall(r"[a-z0-9]+", text))


def normalized_text(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).strip().split())


def normalized_name(value: Any) -> str:
    return normalized_text(value).upper()


def normalized_optional(value: Any) -> str | None:
    text = normalized_text(value)
    return None if text.upper() in MISSING_MARKERS else text


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def linewise_artifact_json(value: dict[str, Any]) -> str:
    """Keep generated JSON reviewable without expanding every row over dozens of lines."""
    lines = ["{"]
    keys = sorted(value)
    for key_index, key in enumerate(keys):
        suffix = "," if key_index < len(keys) - 1 else ""
        encoded_key = json.dumps(key, ensure_ascii=False)
        item = value[key]
        if isinstance(item, list):
            lines.append(f"  {encoded_key}: [")
            for item_index, entry in enumerate(item):
                entry_suffix = "," if item_index < len(item) - 1 else ""
                encoded_entry = json.dumps(entry, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                lines.append(f"    {encoded_entry}{entry_suffix}")
            lines.append(f"  ]{suffix}")
        else:
            encoded_item = json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            lines.append(f"  {encoded_key}: {encoded_item}{suffix}")
    lines.append("}")
    return "\n".join(lines) + "\n"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _column_index(cell_reference: str) -> int:
    letters = re.match(r"[A-Z]+", cell_reference.upper())
    if not letters:
        raise PrecheckError(f"Invalid XLSX cell reference: {cell_reference}")
    result = 0
    for char in letters.group(0):
        result = result * 26 + ord(char) - ord("A") + 1
    return result - 1


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.iter(f"{{{XML_NS}}}t")) for item in root]


def _sheet_path(archive: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationship_id = None
    for sheet in workbook.findall(f".//{{{XML_NS}}}sheet"):
        if sheet.attrib.get("name") == sheet_name:
            relationship_id = sheet.attrib.get(f"{{{REL_NS}}}id")
            break
    if not relationship_id:
        available = [item.attrib.get("name", "") for item in workbook.findall(f".//{{{XML_NS}}}sheet")]
        raise PrecheckError(f"SOURCE_SHEET_NOT_FOUND:{sheet_name}; available={','.join(available)}")

    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in relationships.findall(f"{{{PACKAGE_REL_NS}}}Relationship"):
        if relationship.attrib.get("Id") == relationship_id:
            target = relationship.attrib.get("Target", "")
            return posixpath.normpath(target.lstrip("/") if target.startswith("/xl/") else posixpath.join("xl", target))
    raise PrecheckError(f"SOURCE_SHEET_RELATIONSHIP_NOT_FOUND:{sheet_name}")


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{{{XML_NS}}}t"))
    value_node = cell.find(f"{{{XML_NS}}}v")
    if value_node is None or value_node.text is None:
        return None
    raw = value_node.text
    if cell_type == "s":
        index = int(raw)
        if index < 0 or index >= len(shared_strings):
            raise PrecheckError("INVALID_SHARED_STRING_INDEX")
        return shared_strings[index]
    if cell_type in {"str", "e"}:
        return raw
    if cell_type == "b":
        return raw == "1"
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def read_xlsx_sheet(path: Path, sheet_name: str) -> SheetData:
    if not path.is_file():
        raise PrecheckError("SOURCE_DATA_FILE_REQUIRED")
    if path.suffix.casefold() != ".xlsx":
        raise PrecheckError("SOURCE_FORMAT_UNSUPPORTED")
    with zipfile.ZipFile(path, "r") as archive:
        shared_strings = _shared_strings(archive)
        root = ET.fromstring(archive.read(_sheet_path(archive, sheet_name)))

    dimension = root.find(f"{{{XML_NS}}}dimension")
    dimension_ref = dimension.attrib.get("ref", "") if dimension is not None else ""
    match = re.search(r":?[A-Z]+(\d+)$", dimension_ref)
    max_row = int(match.group(1)) if match else 0
    rows_by_number: dict[int, dict[int, Any]] = {}
    formula_by_column: Counter[int] = Counter()
    max_column = 0
    for row in root.findall(f".//{{{XML_NS}}}sheetData/{{{XML_NS}}}row"):
        row_number = int(row.attrib.get("r", "0"))
        max_row = max(max_row, row_number)
        values: dict[int, Any] = {}
        for cell in row.findall(f"{{{XML_NS}}}c"):
            column = _column_index(cell.attrib.get("r", ""))
            max_column = max(max_column, column + 1)
            values[column] = _cell_value(cell, shared_strings)
            if cell.find(f"{{{XML_NS}}}f") is not None:
                formula_by_column[column] += 1
        rows_by_number[row_number] = values

    header_cells = rows_by_number.get(1, {})
    headers = tuple(normalized_text(header_cells.get(index)) for index in range(max_column))
    if not any(headers):
        raise PrecheckError("SOURCE_HEADER_ROW_EMPTY")
    rows = tuple(
        SheetRow(row_number, tuple(rows_by_number.get(row_number, {}).get(index) for index in range(max_column)))
        for row_number in range(2, max_row + 1)
    )
    formula_counts = tuple(formula_by_column[index] for index in range(max_column))
    return SheetData(headers, rows, formula_counts)


def resolve_fields(headers: Iterable[str]) -> dict[str, int | None]:
    normalized = [normalized_header(header) for header in headers]
    resolved: dict[str, int | None] = {}
    for field, aliases in FIELD_ALIASES.items():
        candidates = {normalized_header(alias) for alias in aliases}
        resolved[field] = next((index for index, header in enumerate(normalized) if header in candidates), None)
    if resolved["name"] is None or resolved["category"] is None or resolved["cas"] is None:
        raise PrecheckError("SOURCE_REQUIRED_COLUMNS_MISSING")
    return resolved


def field_value(row: SheetRow, fields: dict[str, int | None], field: str) -> Any:
    index = fields.get(field)
    return None if index is None or index >= len(row.values) else row.values[index]


def cas_checksum_valid(value: str) -> bool:
    digits = value.replace("-", "")
    if len(digits) < 4 or not digits.isdigit():
        return False
    body, expected = digits[:-1], int(digits[-1])
    return sum(int(digit) * multiplier for multiplier, digit in enumerate(reversed(body), start=1)) % 10 == expected


def cas_claims(value: Any) -> tuple[list[dict[str, str]], bool]:
    raw = normalized_optional(value)
    if raw is None:
        return [], False
    matches = list(dict.fromkeys(CAS_PATTERN.findall(raw)))
    claims = [
        {"value": claim, "formatStatus": "VALID" if cas_checksum_valid(claim) else "INVALID_CHECKSUM"}
        for claim in matches
    ]
    residue = CAS_PATTERN.sub("", raw)
    malformed = (
        not matches
        or any(item["formatStatus"] != "VALID" for item in claims)
        or CAS_ALLOWED_RESIDUE_PATTERN.fullmatch(residue) is None
    )
    return claims, malformed


def evidence_verified(row: SheetRow, fields: dict[str, int | None]) -> bool:
    confidence = normalized_name(field_value(row, fields, "source_confidence"))
    evidence_type = normalized_name(field_value(row, fields, "evidence_type"))
    has_reference = any(normalized_optional(field_value(row, fields, field)) for field in ("supplier_url", "structure_url", "pubchem_url", "additional_url"))
    return confidence in {"VERIFIED", "HIGH"} and evidence_type not in MISSING_MARKERS and has_reference


def structure_claim(row: SheetRow, fields: dict[str, int | None]) -> dict[str, str | None]:
    return {
        field: normalized_optional(field_value(row, fields, field))
        for field in ("canonical_smiles", "isomeric_smiles", "inchi", "inchikey")
    }


def validate_structure_with_rdkit(claim: dict[str, str | None]) -> dict[str, str | None]:
    try:
        from rdkit import Chem, rdBase
    except ImportError as error:
        raise PrecheckError("RDKIT_RUNTIME_REQUIRED_FOR_STRUCTURE_CLAIMS") from error

    smiles = claim["isomeric_smiles"] or claim["canonical_smiles"]
    molecule = Chem.MolFromSmiles(smiles) if smiles else None
    inchi_molecule = Chem.MolFromInchi(claim["inchi"]) if claim["inchi"] else None
    if smiles and molecule is None:
        return {"status": "INVALID", "canonicalSmiles": None, "inchiKey": None}
    if claim["inchi"] and inchi_molecule is None:
        return {"status": "INVALID", "canonicalSmiles": None, "inchiKey": None}
    molecule = molecule or inchi_molecule
    if molecule is None:
        if claim["inchikey"] and not INCHIKEY_PATTERN.fullmatch(claim["inchikey"].upper()):
            return {"status": "INVALID", "canonicalSmiles": None, "inchiKey": None}
        return {"status": "CONFLICTED", "canonicalSmiles": None, "inchiKey": claim["inchikey"]}

    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    generated_inchi = Chem.MolToInchi(molecule)
    generated_key = Chem.InchiToInchiKey(generated_inchi) if generated_inchi else None
    if inchi_molecule is not None:
        inchi_key = Chem.InchiToInchiKey(Chem.MolToInchi(inchi_molecule))
        if generated_key != inchi_key:
            return {"status": "CONFLICTED", "canonicalSmiles": None, "inchiKey": None}
    supplied_key = claim["inchikey"].upper() if claim["inchikey"] else None
    if supplied_key and (not INCHIKEY_PATTERN.fullmatch(supplied_key) or supplied_key != generated_key):
        return {"status": "CONFLICTED", "canonicalSmiles": None, "inchiKey": None}
    return {
        "status": "VALID_NORMALIZABLE",
        "canonicalSmiles": canonical,
        "inchiKey": generated_key,
        "rdkitVersion": rdBase.rdkitVersion,
    }


def dilution_from_name(name: str) -> dict[str, Any] | None:
    match = DILUTION_PATTERN.match(name)
    if match:
        concentration = float(match.group("percent").replace(",", "."))
        if concentration <= 0 or concentration >= 100:
            return None
        return {
            "activeName": normalized_text(match.group("active")),
            "activeConcentration": concentration,
            "carrierName": normalized_text(match.group("carrier")).upper(),
            "carrierConcentration": 100 - concentration,
        }
    match = IN_CARRIER_PATTERN.match(name)
    if match:
        return {
            "activeName": normalized_text(match.group("active")),
            "activeConcentration": None,
            "carrierName": normalized_text(match.group("carrier")).upper(),
            "carrierConcentration": None,
        }
    return None


def structured_dilution(row: SheetRow, fields: dict[str, int | None]) -> dict[str, Any] | None:
    active = normalized_optional(field_value(row, fields, "active_name"))
    carrier = normalized_optional(field_value(row, fields, "carrier"))
    concentration = field_value(row, fields, "active_concentration")
    if not active or not carrier:
        return None
    try:
        numeric = float(str(concentration).replace(",", "."))
    except (TypeError, ValueError):
        numeric = None
    if numeric is not None and not 0 < numeric < 100:
        numeric = None
    return {
        "activeName": active,
        "activeConcentration": numeric,
        "carrierName": carrier,
        "carrierConcentration": None if numeric is None else 100 - numeric,
    }


def classify_product(name: str, category: str, dilution: dict[str, Any] | None, has_structured_components: bool = False) -> str:
    upper_name = normalized_name(name)
    upper_category = normalized_name(category)
    if BASE_PATTERN.search(upper_name):
        return "BASE"
    if dilution:
        return "DILUTION"
    if upper_category in NATURAL_CATEGORIES or NATURAL_NAME_PATTERN.search(upper_name) and upper_category not in NEAT_CATEGORIES:
        return "NATURAL"
    if MIXTURE_PATTERN.search(upper_name):
        return "DEFINED_MIXTURE" if has_structured_components else "UNDEFINED_MIXTURE"
    if FORMULATION_PATTERN.search(upper_name):
        return "FORMULATION"
    if upper_category in NEAT_CATEGORIES and upper_name:
        return "NEAT_SUBSTANCE"
    return "UNKNOWN"


def component_plan(dilution: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not dilution:
        return []
    evidence = "SUPPLIER_COMPOSITION_DOCUMENT_REQUIRED"
    return [
        {
            "componentName": dilution["activeName"],
            "role": "ACTIVE",
            "concentration": dilution["activeConcentration"],
            "basis": "UNKNOWN",
            "candidateChemicalEntity": None,
            "resolutionStatus": "UNRESOLVED",
            "evidenceRequirement": evidence,
        },
        {
            "componentName": dilution["carrierName"],
            "role": "CARRIER",
            "concentration": dilution["carrierConcentration"],
            "basis": "UNKNOWN",
            "candidateChemicalEntity": None,
            "resolutionStatus": "UNRESOLVED",
            "evidenceRequirement": evidence,
        },
    ]


def eligibility_preview(classification: str, structure_status: str, requires_review: bool) -> tuple[str, list[str]]:
    reason = {
        "DILUTION": "DILUTION_PRODUCT",
        "DEFINED_MIXTURE": "DEFINED_MIXTURE",
        "UNDEFINED_MIXTURE": "UNDEFINED_MIXTURE",
        "NATURAL": "NATURAL_COMPLEX",
        "BASE": "PROPRIETARY_BASE",
        "FORMULATION": "FORMULATION",
        "UNKNOWN": "UNKNOWN_COMPOSITION",
    }.get(classification)
    if reason:
        result = "REVIEW_REQUIRED" if classification == "UNKNOWN" else "NOT_ELIGIBLE"
        return result, [reason]
    if structure_status in {"INVALID", "CONFLICTED"} or requires_review:
        return "REVIEW_REQUIRED", ["IDENTITY_CONFLICT" if structure_status == "CONFLICTED" else "UNVERIFIED_STRUCTURE"]
    return "ELIGIBLE_AFTER_VERIFICATION", ["UNVERIFIED_STRUCTURE" if structure_status == "VALID_NORMALIZABLE" else "NO_STRUCTURE"]


def _group_id(prefix: str, index: int) -> str:
    return f"{prefix}-{index:04d}"


def _concentration_variant_key(name: str) -> tuple[str, str] | None:
    matches = PERCENT_PATTERN.findall(name)
    if not matches:
        return None
    base = PERCENT_PATTERN.sub("", normalized_name(name))
    base = re.sub(rf"\b(?:{CARRIER_PATTERN_TEXT})\b", "", base, flags=re.IGNORECASE)
    base = " ".join(base.split()).strip(" -/()")
    return (base, "|".join(value.replace(",", ".") for value in matches)) if base else None


def assign_ingest_wave(item: dict[str, Any]) -> str:
    """Assign exactly one processing wave, with review safety taking precedence."""
    if item.get("reviewRequired") or item.get("conflictCodes") or item.get("malformedCasClaim"):
        return "Wave E"
    if item.get("chemicalEntityAction") in {"LINK_VERIFIED_EXISTING", "CREATE_VERIFIED_CANDIDATE"}:
        return "Wave A"
    action = item.get("enrichmentAction")
    if action == "AUTHORITATIVE_LOOKUP_READY":
        return "Wave B"
    if action == "SUPPLIER_DOCUMENT_REQUIRED":
        return "Wave C"
    if action == "NO_SINGLE_MOLECULE_LOOKUP":
        return "Wave D"
    return "Wave E"


def validate_evidence_requirements(item: dict[str, Any]) -> None:
    action = item["enrichmentAction"]
    requirements = set(item["evidenceRequirements"])
    if action == "AUTHORITATIVE_LOOKUP_READY" and not {
        "AUTHORITATIVE_CAS_VERIFICATION",
        "AUTHORITATIVE_STRUCTURE_EVIDENCE",
    }.issubset(requirements):
        raise PrecheckError("AUTHORITATIVE_LOOKUP_EVIDENCE_REQUIREMENT_MISSING")
    if action == "SUPPLIER_DOCUMENT_REQUIRED" and "SUPPLIER_COMPOSITION_DOCUMENT" not in requirements:
        raise PrecheckError("SUPPLIER_DOCUMENT_EVIDENCE_REQUIREMENT_MISSING")
    if action == "NO_SINGLE_MOLECULE_LOOKUP" and "NO_REPRESENTATIVE_SINGLE_MOLECULE" not in requirements:
        raise PrecheckError("NO_SINGLE_MOLECULE_EVIDENCE_REQUIREMENT_MISSING")
    if action == "MANUAL_REVIEW_REQUIRED" and "MANUAL_IDENTITY_REVIEW" not in requirements:
        raise PrecheckError("MANUAL_REVIEW_EVIDENCE_REQUIREMENT_MISSING")
    if "NO_REPRESENTATIVE_SINGLE_MOLECULE" in requirements and "AUTHORITATIVE_STRUCTURE_EVIDENCE" in requirements:
        raise PrecheckError("CONTRADICTORY_MOLECULAR_EVIDENCE_REQUIREMENTS")


def cas_collision_semantics(items: list[dict[str, Any]]) -> str:
    if any({"IDENTITY_NAME_CAS_CONFLICT", "STRUCTURE_CONFLICT"} & set(item["conflictCodes"]) for item in items):
        return "CAS_IDENTITY_CONFLICT"
    if any(item["malformedCasClaim"] for item in items):
        return "CAS_REVIEW_REQUIRED"
    classifications = {item["productClassification"] for item in items}
    names = {item["normalizedName"] for item in items if item["normalizedName"]}
    suppliers = {normalized_name(item["supplier"]) for item in items if item["supplier"]}
    if "DILUTION" in classifications or len(classifications) > 1 or len(names) == 1:
        return "CAS_SHARED_PRODUCT_VARIANTS"
    if len(names) > 1 and len(suppliers) <= 1:
        return "CAS_SHARED_TRADE_PRODUCTS"
    if len(names) > 1:
        return "CAS_POTENTIAL_ENTITY_REUSE"
    return "CAS_REVIEW_REQUIRED"


def analyze_rows(
    sheet: SheetData,
    structure_validator: Callable[[dict[str, str | None]], dict[str, str | None]] = validate_structure_with_rdkit,
    sheet_name: str = DEFAULT_SHEET,
    source_supplier: str | None = None,
) -> dict[str, Any]:
    fields = resolve_fields(sheet.headers)
    preliminary: list[dict[str, Any]] = []
    for source in sheet.rows:
        name = normalized_text(field_value(source, fields, "name"))
        category = normalized_text(field_value(source, fields, "category"))
        supplier = normalized_optional(field_value(source, fields, "supplier")) or normalized_optional(source_supplier)
        supplier_code = normalized_optional(field_value(source, fields, "supplier_product_code"))
        dilution = structured_dilution(source, fields) or dilution_from_name(name)
        classification = classify_product(name, category, dilution, bool(dilution))
        source_cas_value = field_value(source, fields, "cas")
        source_cas_raw = normalized_text(source_cas_value) or None
        claims, malformed_cas = cas_claims(source_cas_value)
        claim = structure_claim(source, fields)
        source_verified = evidence_verified(source, fields)
        if any(claim.values()):
            validation = structure_validator(claim)
            structure_status = str(validation["status"])
            structure_claim_key = "|".join(str(value) for value in (validation.get("canonicalSmiles"), validation.get("inchiKey")) if value)
            structure_candidate_key = validation.get("canonicalSmiles") if structure_status == "VALID_NORMALIZABLE" and source_verified else None
            verified_canonical_smiles = validation.get("canonicalSmiles") if structure_candidate_key else None
            verified_inchikey = validation.get("inchiKey") if structure_candidate_key else None
        else:
            structure_status = "MISSING"
            structure_claim_key = None
            structure_candidate_key = None
            verified_canonical_smiles = None
            verified_inchikey = None
        components = component_plan(dilution)
        formula = normalized_optional(field_value(source, fields, "formula"))
        molecular_weight = normalized_optional(field_value(source, fields, "molecular_weight"))
        try:
            parsed_molecular_weight = float(molecular_weight.replace(",", ".")) if molecular_weight else None
            if parsed_molecular_weight is not None and parsed_molecular_weight <= 0:
                parsed_molecular_weight = None
        except ValueError:
            parsed_molecular_weight = None
        source_ref = next((
            value for value in (
                normalized_optional(field_value(source, fields, "supplier_url")),
                normalized_optional(field_value(source, fields, "structure_url")),
                normalized_optional(field_value(source, fields, "pubchem_url")),
                normalized_optional(field_value(source, fields, "additional_url")),
            ) if value
        ), None)
        verified_structure_candidate = ({
            "canonicalSmiles": verified_canonical_smiles,
            "isomericSmiles": normalized_optional(field_value(source, fields, "isomeric_smiles")),
            "inchi": normalized_optional(field_value(source, fields, "inchi")),
            "inchiKey": verified_inchikey,
            "structureHash": hashlib.sha256(verified_canonical_smiles.encode("utf-8")).hexdigest(),
            "normalizationVersion": RDKIT_CONTRACT,
            "rdkitVersion": validation.get("rdkitVersion"),
            "molecularFormula": formula,
            "molecularWeight": parsed_molecular_weight,
            "sourceRef": source_ref,
        } if verified_canonical_smiles and verified_inchikey and source_ref else None)
        preliminary.append({
            "sourceRowId": f"{sheet_name}!{source.row_number}",
            "sourceRowNumber": source.row_number,
            "sourceCatalogNumber": field_value(source, fields, "source_number"),
            "inputName": name,
            "normalizedName": normalized_name(name),
            "normalizedDisplayName": name,
            "supplier": supplier,
            "supplierName": supplier,
            "supplierProductCode": supplier_code,
            "tradeName": normalized_optional(field_value(source, fields, "trade_name")),
            "grade": normalized_optional(field_value(source, fields, "grade")),
            "physicalForm": normalized_optional(field_value(source, fields, "physical_state")),
            "sourceCategory": category,
            "productClassification": classification,
            "sourceCasClaims": claims,
            "sourceCasRaw": source_cas_raw,
            "sourceCasRawPresent": normalized_optional(source_cas_value) is not None,
            "malformedCasClaim": malformed_cas,
            "sourceStructureClaimStatus": structure_status,
            "sourceStructureClaimPresent": any(claim.values()),
            "sourceFormulaPresent": formula is not None,
            "sourceFormula": formula,
            "sourceMolecularWeight": parsed_molecular_weight,
            "sourceFemaClaims": [value] if (value := normalized_optional(field_value(source, fields, "fema"))) else [],
            "sourceEinecsClaims": [value] if (value := normalized_optional(field_value(source, fields, "einecs"))) else [],
            "verifiedStructureCandidate": verified_structure_candidate,
            "sourceEvidenceVerified": source_verified,
            "structureClaimKey": structure_claim_key,
            "structureCandidateKey": structure_candidate_key,
            "verifiedCanonicalSmilesCandidate": verified_canonical_smiles,
            "verifiedInchiKeyCandidate": verified_inchikey,
            "componentCount": len(components),
            "componentPlan": components,
            "componentAction": "CREATE_EXPLICIT_COMPONENT_PLAN" if components else "NONE",
            "duplicateGroup": None,
            "duplicateCandidateIds": [],
            "conflictCodes": [],
            "reasonCodes": [],
            "evidenceRequirements": [],
        })

    name_groups: dict[str, list[int]] = defaultdict(list)
    supplier_code_groups: dict[str, list[int]] = defaultdict(list)
    cas_groups: dict[str, list[int]] = defaultdict(list)
    structure_groups: dict[str, list[int]] = defaultdict(list)
    inchikey_groups: dict[str, list[int]] = defaultdict(list)
    concentration_groups: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for index, item in enumerate(preliminary):
        if item["normalizedName"]:
            name_groups[f"{normalized_name(item['supplier'])}|{item['normalizedName']}"].append(index)
        if item["supplierProductCode"]:
            supplier_code_groups[f"{normalized_name(item['supplier'])}|{normalized_name(item['supplierProductCode'])}"].append(index)
        for claim in item["sourceCasClaims"]:
            if claim["formatStatus"] == "VALID":
                cas_groups[claim["value"]].append(index)
        if item["structureCandidateKey"]:
            structure_groups[str(item["structureCandidateKey"])].append(index)
        if item["verifiedInchiKeyCandidate"]:
            inchikey_groups[str(item["verifiedInchiKeyCandidate"])].append(index)
        variant = _concentration_variant_key(item["inputName"])
        if variant:
            concentration_groups[variant[0]].append((index, variant[1]))

    exact_groups = [members for members in name_groups.values() if len(members) > 1]
    supplier_duplicates = [members for members in supplier_code_groups.values() if len(members) > 1]
    cas_collisions = [
        (cas_value, sorted(set(members)))
        for cas_value, members in cas_groups.items()
        if len(set(members)) > 1
    ]
    structure_candidates = [sorted(set(members)) for members in structure_groups.values() if len(set(members)) > 1]
    inchikey_candidates = [sorted(set(members)) for members in inchikey_groups.values() if len(set(members)) > 1]
    concentration_variants = [
        sorted({index for index, _ in members})
        for members in concentration_groups.values()
        if len({variant for _, variant in members}) > 1 and len({index for index, _ in members}) > 1
    ]

    exact_group_records = []
    identity_conflicts = []
    for group_number, members in enumerate(sorted(exact_groups, key=lambda group: preliminary[group[0]]["sourceRowNumber"]), start=1):
        group_id = _group_id("PRODUCT-DUP", group_number)
        row_ids = [preliminary[index]["sourceRowId"] for index in members]
        cas_sets = {tuple(item["value"] for item in preliminary[index]["sourceCasClaims"]) for index in members}
        structure_keys = {preliminary[index]["structureClaimKey"] for index in members if preliminary[index]["structureClaimKey"]}
        conflict_codes = []
        if len(cas_sets) > 1:
            conflict_codes.append("IDENTITY_NAME_CAS_CONFLICT")
        if len(structure_keys) > 1:
            conflict_codes.append("STRUCTURE_CONFLICT")
        for index in members:
            preliminary[index]["duplicateGroup"] = group_id
            preliminary[index]["duplicateCandidateIds"].extend(row_id for row_id in row_ids if row_id != preliminary[index]["sourceRowId"])
            preliminary[index]["conflictCodes"].append("DUPLICATE_PRODUCT_ROW")
            preliminary[index]["conflictCodes"].extend(conflict_codes)
        record = {"groupId": group_id, "sourceRowIds": row_ids, "conflictCodes": conflict_codes}
        exact_group_records.append(record)
        if conflict_codes:
            identity_conflicts.append(record)

    cas_group_records = []
    for group_number, (cas_value, members) in enumerate(
        sorted(cas_collisions, key=lambda group: (preliminary[group[1][0]]["sourceRowNumber"], group[0])),
        start=1,
    ):
        group_id = _group_id("CAS-COLLISION", group_number)
        row_ids = [preliminary[index]["sourceRowId"] for index in members]
        collision_items = [preliminary[index] for index in members]
        for index in members:
            preliminary[index]["duplicateCandidateIds"].extend(row_id for row_id in row_ids if row_id != preliminary[index]["sourceRowId"])
            preliminary[index]["reasonCodes"].append("CAS_COLLISION_REQUIRES_ENTITY_REVIEW")
        cas_group_records.append({
            "casValue": cas_value,
            "groupId": group_id,
            "sourceRowIds": row_ids,
            "rowCount": len(row_ids),
            "collisionSemantics": cas_collision_semantics(collision_items),
            "distinctNormalizedNames": sorted({item["normalizedName"] for item in collision_items if item["normalizedName"]}),
            "distinctProductClassifications": sorted({item["productClassification"] for item in collision_items}),
            "distinctSuppliers": sorted({item["supplier"] for item in collision_items if item["supplier"]}),
        })

    structure_group_records = []
    for group_number, members in enumerate(sorted(structure_candidates, key=lambda group: preliminary[group[0]]["sourceRowNumber"]), start=1):
        group_id = _group_id("STRUCTURE-CANDIDATE", group_number)
        row_ids = [preliminary[index]["sourceRowId"] for index in members]
        for index in members:
            preliminary[index]["duplicateCandidateIds"].extend(row_id for row_id in row_ids if row_id != preliminary[index]["sourceRowId"])
        structure_group_records.append({"groupId": group_id, "sourceRowIds": row_ids})

    inchikey_group_records = []
    for group_number, members in enumerate(sorted(inchikey_candidates, key=lambda group: preliminary[group[0]]["sourceRowNumber"]), start=1):
        group_id = _group_id("INCHIKEY-CANDIDATE", group_number)
        row_ids = [preliminary[index]["sourceRowId"] for index in members]
        for index in members:
            preliminary[index]["duplicateCandidateIds"].extend(row_id for row_id in row_ids if row_id != preliminary[index]["sourceRowId"])
        inchikey_group_records.append({"groupId": group_id, "sourceRowIds": row_ids})

    concentration_group_records = []
    for group_number, members in enumerate(sorted(concentration_variants, key=lambda group: preliminary[group[0]]["sourceRowNumber"]), start=1):
        concentration_group_records.append({
            "groupId": _group_id("CONCENTRATION-VARIANT", group_number),
            "sourceRowIds": [preliminary[index]["sourceRowId"] for index in members],
        })

    for item in preliminary:
        conflicts = set(item["conflictCodes"])
        if item["malformedCasClaim"]:
            conflicts.add("CAS_CLAIM_FORMAT_INVALID")
        if item["sourceStructureClaimStatus"] == "INVALID":
            conflicts.add("INVALID_STRUCTURE_CLAIM")
        if item["sourceStructureClaimStatus"] == "CONFLICTED":
            conflicts.add("STRUCTURE_CONFLICT")
        item["conflictCodes"] = sorted(conflicts)
        item["duplicateCandidateIds"] = sorted(set(item["duplicateCandidateIds"]))

        review_required = bool(item["conflictCodes"] or item["duplicateCandidateIds"] or not item["inputName"])
        classification = item["productClassification"]
        if not item["inputName"] or classification == "UNKNOWN" or item["sourceStructureClaimStatus"] in {"INVALID", "CONFLICTED"}:
            chemical_action = "REVIEW_REQUIRED"
        elif review_required:
            chemical_action = "REVIEW_REQUIRED"
        elif classification in {"NATURAL", "BASE", "DEFINED_MIXTURE", "UNDEFINED_MIXTURE"}:
            chemical_action = "CREATE_COMPLEX"
        elif classification == "FORMULATION":
            chemical_action = "NOT_APPLICABLE"
        elif item["sourceStructureClaimStatus"] == "VALID_NORMALIZABLE" and item["sourceEvidenceVerified"]:
            chemical_action = "CREATE_VERIFIED_CANDIDATE"
        else:
            chemical_action = "CREATE_UNRESOLVED"
        item["chemicalEntityAction"] = chemical_action
        item["primaryChemicalEntityAction"] = chemical_action
        item["resolutionStatus"] = "CONFLICTED" if item["conflictCodes"] else "NOT_APPLICABLE" if chemical_action == "NOT_APPLICABLE" else "UNRESOLVED"

        if item["sourceStructureClaimStatus"] == "CONFLICTED":
            molecular_action = "CONFLICTED"
        elif classification in {"NATURAL", "BASE", "DEFINED_MIXTURE", "UNDEFINED_MIXTURE", "FORMULATION"}:
            molecular_action = "NOT_APPLICABLE"
        elif item["sourceStructureClaimStatus"] == "VALID_NORMALIZABLE" and item["sourceEvidenceVerified"]:
            molecular_action = "NORMALIZE_VERIFIED_SOURCE_STRUCTURE"
        else:
            molecular_action = "NEEDS_AUTHORITATIVE_VERIFICATION"
        item["molecularIdentityAction"] = molecular_action

        eligibility, eligibility_reasons = eligibility_preview(classification, item["sourceStructureClaimStatus"], review_required)
        item["eligibilityPrediction"] = eligibility
        item["eligibilityPreview"] = eligibility
        item["eligibilityReasonCodes"] = eligibility_reasons

        requirements = {"SOURCE_ASSERTION_PROVENANCE"}
        if item["sourceCasRawPresent"]:
            requirements.add("AUTHORITATIVE_CAS_VERIFICATION")
        if classification == "DILUTION":
            requirements.update({"SUPPLIER_COMPOSITION_DOCUMENT", "ACTIVE_AND_CARRIER_IDENTITY_EVIDENCE"})
        elif classification in {"NATURAL", "BASE", "DEFINED_MIXTURE", "UNDEFINED_MIXTURE", "FORMULATION"}:
            requirements.update({"SUPPLIER_COMPOSITION_DOCUMENT", "NO_REPRESENTATIVE_SINGLE_MOLECULE"})
        elif classification == "NEAT_SUBSTANCE":
            requirements.add("AUTHORITATIVE_STRUCTURE_EVIDENCE")
        if classification in {"NATURAL", "BASE", "FORMULATION", "DEFINED_MIXTURE", "UNDEFINED_MIXTURE"}:
            enrichment = "NO_SINGLE_MOLECULE_LOOKUP"
        elif classification == "DILUTION":
            enrichment = "SUPPLIER_DOCUMENT_REQUIRED"
        elif review_required or not item["sourceCasClaims"]:
            enrichment = "MANUAL_REVIEW_REQUIRED"
        else:
            enrichment = "AUTHORITATIVE_LOOKUP_READY"
        if review_required or enrichment == "MANUAL_REVIEW_REQUIRED":
            requirements.add("MANUAL_IDENTITY_REVIEW")
        item["evidenceRequirements"] = sorted(requirements)
        item["enrichmentAction"] = enrichment
        item["reviewRequired"] = review_required or enrichment == "MANUAL_REVIEW_REQUIRED"
        validate_evidence_requirements(item)
        item["recommendedWave"] = assign_ingest_wave(item)
        item["reasonCodes"] = sorted(set(item["reasonCodes"] + eligibility_reasons))
        item.pop("structureClaimKey", None)
        item.pop("structureCandidateKey", None)
        item.pop("verifiedCanonicalSmilesCandidate", None)
        item.pop("verifiedInchiKeyCandidate", None)
        item.pop("malformedCasClaim", None)
        item.pop("sourceEvidenceVerified", None)

    structure_conflicts = [group for group in identity_conflicts if "STRUCTURE_CONFLICT" in group["conflictCodes"]]
    combined_candidate_groups = []
    seen_candidate_memberships = set()
    for group in structure_group_records + inchikey_group_records:
        membership = tuple(group["sourceRowIds"])
        if membership not in seen_candidate_memberships:
            seen_candidate_memberships.add(membership)
            combined_candidate_groups.append(group)
    return {
        "results": preliminary,
        "conflicts": {
            "exactProductDuplicateGroups": exact_group_records,
            "supplierProductCodeDuplicateGroups": [
                {"groupId": _group_id("SUPPLIER-CODE-DUP", index), "sourceRowIds": [preliminary[item]["sourceRowId"] for item in members]}
                for index, members in enumerate(supplier_duplicates, start=1)
            ],
            "chemicalEntityDuplicateCandidateGroups": combined_candidate_groups,
            "verifiedStructureCandidateGroups": structure_group_records,
            "inchiKeyCandidateGroups": inchikey_group_records,
            "casCollisionGroups": cas_group_records,
            "structureConflictGroups": structure_conflicts,
            "identityConflictGroups": identity_conflicts,
            "concentrationVariantGroups": concentration_group_records,
        },
    }


def build_counts(results: list[dict[str, Any]], conflicts: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    classification = Counter(item["productClassification"] for item in results)
    chemical = Counter(item["chemicalEntityAction"] for item in results)
    enrichment = Counter(item["enrichmentAction"] for item in results)
    waves = Counter(item.get("recommendedWave") for item in results)
    wave_memberships = [sum(item.get("recommendedWave") == wave for wave in INGEST_WAVES) for item in results]
    duplicate_rows = {row_id for group in conflicts["exactProductDuplicateGroups"] for row_id in group["sourceRowIds"]}
    return {
        "SOURCE_ROW_COUNT": len(results),
        "DRY_RUN_INPUT_ROWS": len(results),
        "DRY_RUN_RESULT_ROWS": len(results),
        "NONEMPTY_NAME_COUNT": sum(bool(item["inputName"]) for item in results),
        "MISSING_NAME_COUNT": sum(not item["inputName"] for item in results),
        "UNIQUE_NORMALIZED_PRODUCT_COUNT": len({item["normalizedName"] for item in results if item["normalizedName"]}),
        **{f"{key}_COUNT": classification[key] for key in PRODUCT_CLASSIFICATIONS},
        "ROWS_WITH_CAS_CLAIMS": sum(item["sourceCasRawPresent"] for item in results),
        "ROWS_WITH_STRUCTURE_CLAIMS": sum(item["sourceStructureClaimPresent"] for item in results),
        "ROWS_WITH_FORMULA_ONLY": sum(item["sourceFormulaPresent"] and not item["sourceStructureClaimPresent"] for item in results),
        "INVALID_STRUCTURE_CLAIM_COUNT": sum(item["sourceStructureClaimStatus"] == "INVALID" for item in results),
        "DUPLICATE_ROW_COUNT": len(duplicate_rows),
        "DUPLICATE_GROUP_COUNT": len(conflicts["exactProductDuplicateGroups"]),
        "EXACT_PRODUCT_DUPLICATE_GROUPS": len(conflicts["exactProductDuplicateGroups"]),
        "CHEMICAL_ENTITY_DUPLICATE_CANDIDATE_GROUPS": len(conflicts["chemicalEntityDuplicateCandidateGroups"]),
        "CAS_COLLISION_GROUPS": len(conflicts["casCollisionGroups"]),
        "STRUCTURE_CONFLICT_GROUPS": len(conflicts["structureConflictGroups"]),
        "IDENTITY_CONFLICT_COUNT": len(conflicts["identityConflictGroups"]),
        "COMPONENT_PLAN_COUNT": sum(bool(item["componentPlan"]) for item in results),
        "MANUAL_REVIEW_ACTION_WITHOUT_REQUIREMENT_COUNT": sum(
            item["enrichmentAction"] == "MANUAL_REVIEW_REQUIRED"
            and "MANUAL_IDENTITY_REVIEW" not in item["evidenceRequirements"]
            for item in results
        ),
        "ROWS_WITH_ZERO_WAVES": sum(count == 0 for count in wave_memberships),
        "ROWS_WITH_MULTIPLE_WAVES": sum(count > 1 for count in wave_memberships),
        **{f"WAVE_{wave[-1]}_COUNT": waves[wave] for wave in INGEST_WAVES},
        "TOTAL_WAVE_ROW_COUNT": sum(waves[wave] for wave in INGEST_WAVES),
        "CHEMICAL_ENTITY_LINK_EXISTING_COUNT": chemical["LINK_VERIFIED_EXISTING"],
        "CHEMICAL_ENTITY_CREATE_VERIFIED_CANDIDATE_COUNT": chemical["CREATE_VERIFIED_CANDIDATE"],
        "CHEMICAL_ENTITY_CREATE_UNRESOLVED_COUNT": chemical["CREATE_UNRESOLVED"],
        "CHEMICAL_ENTITY_CREATE_COMPLEX_COUNT": chemical["CREATE_COMPLEX"],
        "CHEMICAL_ENTITY_REVIEW_REQUIRED_COUNT": chemical["REVIEW_REQUIRED"],
        "CHEMICAL_ENTITY_NOT_APPLICABLE_COUNT": chemical["NOT_APPLICABLE"],
        "EXPECTED_UNIQUE_CHEMICAL_ENTITY_CANDIDATES": chemical["CREATE_VERIFIED_CANDIDATE"] + chemical["CREATE_UNRESOLVED"] + chemical["CREATE_COMPLEX"],
        **{f"{key}_COUNT": enrichment[key] for key in ENRICHMENT_ACTIONS},
    }


def profile_columns(sheet: SheetData) -> list[dict[str, Any]]:
    aliases = resolve_fields(sheet.headers)
    reverse = {index: field for field, index in aliases.items() if index is not None}
    profile = []
    for index, header in enumerate(sheet.headers):
        values = [row.values[index] if index < len(row.values) else None for row in sheet.rows]
        nonempty = sum(value is not None and normalized_text(value) != "" for value in values)
        profile.append({
            "columnIndex": index + 1,
            "header": header,
            "mappedConcept": reverse.get(index, "unmapped"),
            "nonemptyValueCount": nonempty,
            "formulaCellCount": sheet.formula_counts[index],
            "claimPolicy": "SOURCE_ASSERTION_NOT_VERIFIED" if index >= 4 else "SOURCE_EVIDENCE_PRESERVED",
        })
    return profile


def recommended_batches(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    descriptions = {
        "Wave A": "Verified/reusable deterministic records",
        "Wave B": "Authoritative identity lookup candidates",
        "Wave C": "Trade materials and explicit dilutions requiring supplier evidence",
        "Wave D": "Natural and complex products with no representative single molecule",
        "Wave E": "Manual duplicate, CAS-collision, malformed, and identity-conflict review",
    }
    counts = Counter(item["recommendedWave"] for item in results)
    return [{"wave": wave, "description": descriptions[wave], "rowCount": counts[wave]} for wave in INGEST_WAVES]


def markdown_table(rows: Iterable[Iterable[Any]]) -> str:
    return "\n".join("| " + " | ".join(str(value).replace("|", "\\|") for value in row) + " |" for row in rows)


def render_source_profile(source: dict[str, Any], columns: list[dict[str, Any]]) -> str:
    table = [["#", "Column", "Mapped concept", "Non-empty", "Formula cells", "Policy"], ["---"] * 6]
    table.extend([
        item["columnIndex"], f"`{item['header']}`", item["mappedConcept"], item["nonemptyValueCount"], item["formulaCellCount"], item["claimPolicy"]
    ] for item in columns)
    return (
        "# Bulk Source Profile\n\n"
        f"- Source file: `{source['fileName']}`\n"
        f"- SHA-256: `{source['fileSha256']}`\n"
        f"- Format: `{source['format']}`\n"
        f"- Sheet: `{source['sheet']}`\n"
        f"- Data rows: `{source['rowCount']}`\n"
        f"- Columns: `{source['columnCount']}`\n"
        f"- Explicit workbook-level supplier context: `{source['supplierContext'] or 'not supplied'}`\n\n"
        "The workbook is external and immutable. Populated chemistry values are source assertions, not verified canonical facts.\n\n"
        "## Column profile\n\n" + markdown_table(table) + "\n"
    )


def render_precheck_markdown(source: dict[str, Any], counts: dict[str, int], batches: list[dict[str, Any]]) -> str:
    count_rows = [["Metric", "Count"], ["---", "---"]] + [[f"`{key}`", value] for key, value in counts.items()]
    batch_rows = [["Wave", "Rows", "Boundary"], ["---", "---", "---"]] + [[item["wave"], item["rowCount"], item["description"]] for item in batches]
    return (
        "# Bulk Ingest Precheck\n\n"
        f"Source `{source['fileName']}` (`{source['fileSha256']}`) was processed locally in preview mode. "
        "No database, provider, external enrichment, deployment, or model-training operation is implemented by this command.\n\n"
        "## Safety policy\n\n"
        "- `FORMULA_TO_SMILES_ALLOWED=NO`\n"
        "- `NAME_ONLY_STRUCTURE_GUESSING_ALLOWED=NO`\n"
        "- `CAS_ONLY_MODEL_ELIGIBLE=NO`\n"
        "- Source chemistry fields remain unverified assertions until supported by governed evidence.\n"
        "- Candidate entity reuse requires verified compatible structure evidence; CAS/name matches are review signals only.\n"
        "- All future persistence remains tenant-scoped.\n\n"
        "## Counts\n\n" + markdown_table(count_rows) + "\n\n"
        "## Recommended ingest waves\n\n" + markdown_table(batch_rows) + "\n\n"
        "Each row has exactly one `recommendedWave`. Conflict, malformed-identity, duplicate-review, and other "
        "manual-review conditions take precedence and route the row to Wave E.\n\n"
        "`BULK_DATA_PRECHECK_READY=YES` means the deterministic data artifacts reconcile. "
        "The goal-level `BULK_INGEST_PRECHECK_READY` remains pending until Pilot50, Osmo, freeze, full-test, and PR-CI gates pass.\n"
    )


def write_artifacts(output_dir: Path, payload: dict[str, Any], columns: list[dict[str, Any]]) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    precheck_path = output_dir / "BULK_INGEST_PRECHECK.json"
    enrichment_path = output_dir / "BULK_ENRICHMENT_QUEUE.json"
    conflict_path = output_dir / "BULK_CONFLICT_REPORT.json"
    profile_path = output_dir / "BULK_SOURCE_PROFILE.md"
    summary_path = output_dir / "BULK_INGEST_PRECHECK.md"
    source = payload["source"]
    results = payload["results"]
    counts = payload["counts"]
    conflicts = payload["conflicts"]
    batches = payload["recommendedIngestBatches"]
    enrichment = {
        "contractVersion": CONTRACT_VERSION,
        "source": source,
        "counts": {key: counts[f"{key}_COUNT"] for key in ENRICHMENT_ACTIONS},
        "items": [
            {
                "sourceRowId": item["sourceRowId"],
                "inputName": item["inputName"],
                "action": item["enrichmentAction"],
                "reasonCodes": item["reasonCodes"],
                "evidenceRequirements": item["evidenceRequirements"],
            }
            for item in results
        ],
    }
    conflict_payload = {
        "contractVersion": CONTRACT_VERSION,
        "source": source,
        "counts": {
            "EXACT_PRODUCT_DUPLICATE_GROUPS": counts["EXACT_PRODUCT_DUPLICATE_GROUPS"],
            "CHEMICAL_ENTITY_DUPLICATE_CANDIDATE_GROUPS": counts["CHEMICAL_ENTITY_DUPLICATE_CANDIDATE_GROUPS"],
            "CAS_COLLISION_GROUPS": counts["CAS_COLLISION_GROUPS"],
            "STRUCTURE_CONFLICT_GROUPS": counts["STRUCTURE_CONFLICT_GROUPS"],
            "IDENTITY_CONFLICT_COUNT": counts["IDENTITY_CONFLICT_COUNT"],
        },
        **conflicts,
    }
    precheck_path.write_text(linewise_artifact_json(payload), encoding="utf-8", newline="\n")
    enrichment_path.write_text(linewise_artifact_json(enrichment), encoding="utf-8", newline="\n")
    conflict_path.write_text(linewise_artifact_json(conflict_payload), encoding="utf-8", newline="\n")
    profile_path.write_text(render_source_profile(source, columns), encoding="utf-8", newline="\n")
    summary_path.write_text(render_precheck_markdown(source, counts, batches), encoding="utf-8", newline="\n")
    return {
        "PRECHECK_JSON": precheck_path.as_posix(),
        "ENRICHMENT_QUEUE_JSON": enrichment_path.as_posix(),
        "CONFLICT_REPORT_JSON": conflict_path.as_posix(),
        "SOURCE_PROFILE": profile_path.as_posix(),
        "PRECHECK_SUMMARY": summary_path.as_posix(),
    }


def run_precheck(source_path: Path, sheet_name: str, output_dir: Path, write_outputs: bool = True, source_supplier: str | None = None) -> dict[str, Any]:
    if not source_path.is_file():
        raise PrecheckError("SOURCE_DATA_FILE_REQUIRED")
    file_hash = sha256_file(source_path)
    sheet = read_xlsx_sheet(source_path, sheet_name)
    analysis = analyze_rows(sheet, sheet_name=sheet_name, source_supplier=source_supplier)
    results = analysis["results"]
    conflicts = analysis["conflicts"]
    counts = build_counts(results, conflicts)
    if counts["DRY_RUN_RESULT_ROWS"] != counts["SOURCE_ROW_COUNT"]:
        raise PrecheckError("SOURCE_ROW_ACCOUNTING_FAILED")
    if sum(counts[f"{key}_COUNT"] for key in PRODUCT_CLASSIFICATIONS) != counts["SOURCE_ROW_COUNT"]:
        raise PrecheckError("CLASSIFICATION_ACCOUNTING_FAILED")
    chemical_action_count_keys = (
        "CHEMICAL_ENTITY_LINK_EXISTING_COUNT",
        "CHEMICAL_ENTITY_CREATE_VERIFIED_CANDIDATE_COUNT",
        "CHEMICAL_ENTITY_CREATE_UNRESOLVED_COUNT",
        "CHEMICAL_ENTITY_CREATE_COMPLEX_COUNT",
        "CHEMICAL_ENTITY_REVIEW_REQUIRED_COUNT",
        "CHEMICAL_ENTITY_NOT_APPLICABLE_COUNT",
    )
    if sum(counts[key] for key in chemical_action_count_keys) != counts["SOURCE_ROW_COUNT"]:
        raise PrecheckError("CHEMICAL_ENTITY_ACTION_ACCOUNTING_FAILED")
    if sum(counts[f"{key}_COUNT"] for key in ENRICHMENT_ACTIONS) != counts["SOURCE_ROW_COUNT"]:
        raise PrecheckError("ENRICHMENT_ACCOUNTING_FAILED")
    if counts["MANUAL_REVIEW_ACTION_WITHOUT_REQUIREMENT_COUNT"] != 0:
        raise PrecheckError("MANUAL_REVIEW_EVIDENCE_ACCOUNTING_FAILED")
    if counts["ROWS_WITH_ZERO_WAVES"] != 0 or counts["ROWS_WITH_MULTIPLE_WAVES"] != 0:
        raise PrecheckError("INGEST_WAVE_EXCLUSIVITY_FAILED")
    if counts["TOTAL_WAVE_ROW_COUNT"] != counts["SOURCE_ROW_COUNT"]:
        raise PrecheckError("INGEST_WAVE_ACCOUNTING_FAILED")
    for collision in conflicts["casCollisionGroups"]:
        if not collision.get("casValue") or collision.get("rowCount") != len(collision.get("sourceRowIds", [])):
            raise PrecheckError("CAS_COLLISION_RECORD_CONTRACT_FAILED")
    if len({collision["casValue"] for collision in conflicts["casCollisionGroups"]}) != len(conflicts["casCollisionGroups"]):
        raise PrecheckError("CAS_COLLISION_VALUES_NOT_UNIQUE")
    source = {
        "fileName": source_path.name,
        "fileSha256": file_hash,
        "format": "XLSX",
        "sheet": sheet_name,
        "rowCount": len(sheet.rows),
        "columnCount": len(sheet.headers),
        "supplierContext": normalized_optional(source_supplier),
    }
    payload = {
        "contractVersion": CONTRACT_VERSION,
        "policyVersion": POLICY_VERSION,
        "rdkitContract": RDKIT_CONTRACT,
        "source": source,
        "safety": {
            "mode": "PREVIEW",
            "formulaToSmilesAllowed": False,
            "nameOnlyStructureGuessingAllowed": False,
            "casOnlyModelEligible": False,
            "remoteDatabaseWrites": 0,
            "networkRequests": 0,
            "modelRetrained": False,
            "tenantScopeRequiredForFutureWrite": True,
        },
        "counts": counts,
        "recommendedIngestBatches": recommended_batches(results),
        "results": results,
        "conflicts": conflicts,
        "dataPrecheckReady": True,
        "bulkIngestPrecheckReady": "PENDING_EXTERNAL_GATES",
    }
    paths = write_artifacts(output_dir, payload, profile_columns(sheet)) if write_outputs else {}
    return {"payload": payload, "artifacts": paths}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local-only Material Intelligence bulk-ingest precheck")
    parser.add_argument("--source", required=True, type=Path, help="External immutable XLSX source")
    parser.add_argument("--sheet", default=DEFAULT_SHEET)
    parser.add_argument("--source-supplier", default=None, help="Explicit workbook-level supplier context when no supplier column exists")
    parser.add_argument("--mode", choices=("preview",), default="preview")
    parser.add_argument("--expected-sha256", default=None)
    parser.add_argument("--output-dir", type=Path, default=Path("docs/v2/material-intelligence"))
    parser.add_argument("--no-write-artifacts", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        actual_hash = sha256_file(args.source) if args.source.is_file() else None
        if args.expected_sha256 and actual_hash != args.expected_sha256.casefold():
            raise PrecheckError("SOURCE_FILE_SHA256_MISMATCH")
        result = run_precheck(args.source, args.sheet, args.output_dir, not args.no_write_artifacts, args.source_supplier)
    except (PrecheckError, zipfile.BadZipFile, ET.ParseError) as error:
        print(f"BULK_INGEST_PRECHECK=FAIL:{error}", file=sys.stderr)
        return 1
    counts = result["payload"]["counts"]
    print("BULK_INGEST_PRECHECK=PASS")
    print(f"SOURCE_ROW_COUNT={counts['SOURCE_ROW_COUNT']}")
    print(f"DRY_RUN_RESULT_ROWS={counts['DRY_RUN_RESULT_ROWS']}")
    print("STAGING_DATABASE_WRITES=0")
    print("PRODUCTION_DATABASE_WRITES=0")
    print("BULK_DATA_PRECHECK_READY=YES")
    print("BULK_INGEST_PRECHECK_READY=PENDING_EXTERNAL_GATES")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

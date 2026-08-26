#!/usr/bin/env python3
"""Fail-closed planning for the platform-global Material Intelligence rebuild.

This module consumes the deterministic local precheck artifact plus an already
verified identity registry. It performs no network, database, provider, or
workbook writes. Every source row receives exactly one terminal disposition.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from material_intelligence_bulk_precheck import (
    CARRIER_NAMES,
    INCHIKEY_PATTERN,
    PrecheckError,
    cas_checksum_valid,
    normalized_name,
    normalized_optional,
    stable_json,
)


CONTRACT_VERSION = "material-intelligence-global-rebuild-plan/1.1.0"
GLOBAL_REBUILD_DISPOSITIONS = (
    "GLOBAL_CANONICAL_NEAT",
    "DILUTION_MERGED_TO_NEAT",
    "EXCLUDED_NATURAL",
    "DEFERRED_MIXTURE",
    "DEFERRED_BASE",
    "REVIEW_REQUIRED",
)
LOOKUP_CLASSIFICATIONS = {"NEAT_SUBSTANCE", "DILUTION"}
DEFERRED_MIXTURE_CLASSIFICATIONS = {
    "DEFINED_MIXTURE",
    "UNDEFINED_MIXTURE",
    "FORMULATION",
}
FATAL_IDENTITY_CONFLICTS = {
    "CAS_CLAIM_FORMAT_INVALID",
    "IDENTITY_NAME_CAS_CONFLICT",
    "INVALID_STRUCTURE_CLAIM",
    "STRUCTURE_CONFLICT",
}
KNOWN_CARRIERS = {normalized_name(value) for value in CARRIER_NAMES}
_CARRIER_PATTERN = "|".join(re.escape(value) for value in sorted(CARRIER_NAMES, key=len, reverse=True))
STRICT_PERCENT_DILUTION_PATTERN = re.compile(
    rf"^(?P<active>.+?)\s+(?P<percent>\d+(?:[.,]\d+)?)\s*%\s+(?P<carrier>{_CARRIER_PATTERN})\s*$",
    re.IGNORECASE,
)
STRICT_IN_CARRIER_PATTERN = re.compile(
    rf"^(?P<active>.+?)\s+IN\s+(?P<carrier>{_CARRIER_PATTERN})\s*$",
    re.IGNORECASE,
)


class _DisjointSet:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


def strict_dilution_from_name(name: str) -> dict[str, Any] | None:
    """Parse only an anchored, explicit carrier expression; never strip suffixes."""
    normalized = " ".join(str(name or "").strip().split())
    match = STRICT_PERCENT_DILUTION_PATTERN.fullmatch(normalized)
    if match:
        concentration = float(match.group("percent").replace(",", "."))
        if not 0 < concentration < 100:
            return None
        return {
            "activeName": " ".join(match.group("active").strip().split()),
            "activeConcentration": concentration,
            "carrierName": " ".join(match.group("carrier").strip().split()).upper(),
            "carrierConcentration": 100 - concentration,
            "extractionMode": "EXACT_NAME_PATTERN",
        }

    match = STRICT_IN_CARRIER_PATTERN.fullmatch(normalized)
    if not match:
        return None
    return {
        "activeName": " ".join(match.group("active").strip().split()),
        "activeConcentration": None,
        "carrierName": " ".join(match.group("carrier").strip().split()).upper(),
        "carrierConcentration": None,
        "extractionMode": "EXACT_NAME_PATTERN_WITHOUT_CONCENTRATION",
    }


def _valid_cas_values(claims: Iterable[dict[str, Any]]) -> tuple[str, ...]:
    values = {
        str(claim.get("value", "")).strip()
        for claim in claims
        if claim.get("formatStatus") == "VALID"
        and cas_checksum_valid(str(claim.get("value", "")).strip())
    }
    return tuple(sorted(value for value in values if value))


def _source_conflict_reasons(item: dict[str, Any]) -> list[str]:
    conflicts = FATAL_IDENTITY_CONFLICTS.intersection(item.get("conflictCodes", []))
    return sorted(conflicts)


def _strict_dilution_evidence(item: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str]]:
    evidence = item.get("dilutionSourceEvidence")
    if not isinstance(evidence, dict):
        parsed = strict_dilution_from_name(str(item.get("inputName", "")))
        if parsed is None:
            return None, ["DILUTION_EXTRACTION_AMBIGUOUS"]
        evidence = {
            **parsed,
            "claimsAgree": True,
            "activeCasClaims": [],
            "activeCasMalformed": False,
            "carrierCasClaims": [],
            "carrierCasMalformed": False,
        }
    else:
        mode = evidence.get("extractionMode")
        if mode == "NAME_PATTERN":
            parsed = strict_dilution_from_name(str(item.get("inputName", "")))
            if parsed is None:
                return None, ["DILUTION_NAME_PATTERN_NOT_EXACT"]
            for key in ("activeName", "activeConcentration", "carrierName", "carrierConcentration"):
                left = evidence.get(key)
                right = parsed.get(key)
                values_match = normalized_name(left) == normalized_name(right) if key.endswith("Name") else left == right
                if not values_match:
                    return None, ["DILUTION_PARSED_EVIDENCE_CONFLICT"]
        elif mode != "STRUCTURED_COLUMNS":
            return None, ["DILUTION_EXTRACTION_MODE_UNSUPPORTED"]

    reasons: list[str] = []
    if evidence.get("claimsAgree") is not True:
        reasons.append("DILUTION_SOURCE_CLAIMS_CONFLICT")
    active_name = normalized_optional(evidence.get("activeName"))
    carrier_name = normalized_optional(evidence.get("carrierName"))
    if active_name is None:
        reasons.append("DILUTION_ACTIVE_NAME_MISSING")
    if carrier_name is None:
        reasons.append("DILUTION_CARRIER_MISSING")
    elif evidence.get("extractionMode") != "STRUCTURED_COLUMNS" and normalized_name(carrier_name) not in KNOWN_CARRIERS:
        reasons.append("DILUTION_CARRIER_AMBIGUOUS")
    if evidence.get("activeCasMalformed"):
        reasons.append("DILUTION_ACTIVE_CAS_MALFORMED")
    if evidence.get("carrierCasMalformed"):
        reasons.append("DILUTION_CARRIER_CAS_MALFORMED")

    active_concentration = evidence.get("activeConcentration")
    carrier_concentration = evidence.get("carrierConcentration")
    if not isinstance(active_concentration, (int, float)) or isinstance(active_concentration, bool) or not 0 < active_concentration < 100:
        reasons.append("DILUTION_CONCENTRATION_UNPROVEN")
    elif not isinstance(carrier_concentration, (int, float)) or isinstance(carrier_concentration, bool) or abs((active_concentration + carrier_concentration) - 100) > 1e-9:
        reasons.append("DILUTION_CONCENTRATION_ACCOUNTING_FAILED")

    if reasons:
        return None, sorted(set(reasons))
    return {
        "activeName": active_name,
        "activeConcentration": active_concentration,
        "activeCasClaims": [dict(claim) for claim in evidence.get("activeCasClaims", [])],
        "activeCasRaw": evidence.get("activeCasRaw"),
        "carrierName": carrier_name,
        "carrierConcentration": carrier_concentration,
        "carrierCasClaims": [dict(claim) for claim in evidence.get("carrierCasClaims", [])],
        "carrierCasRaw": evidence.get("carrierCasRaw"),
        "extractionMode": evidence.get("extractionMode"),
    }, []


def _lookup_candidate(item: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str], dict[str, Any] | None]:
    classification = item.get("productClassification")
    if classification not in LOOKUP_CLASSIFICATIONS:
        return None, [], None

    conflicts = _source_conflict_reasons(item)
    if conflicts:
        return None, [f"SOURCE_{code}" for code in conflicts], None

    if classification == "DILUTION":
        dilution, reasons = _strict_dilution_evidence(item)
        if dilution is None:
            return None, reasons, None
        names = (normalized_name(dilution["activeName"]),)
        cas_values = _valid_cas_values(dilution.get("activeCasClaims", []))
        provenance_dilution = dilution
    else:
        name = normalized_name(item.get("inputName"))
        if not name:
            return None, ["NEAT_IDENTITY_NAME_MISSING"], None
        names = (name,)
        cas_values = _valid_cas_values(item.get("sourceCasClaims", []))
        provenance_dilution = None

    inchi_keys: tuple[str, ...] = ()
    structure = item.get("verifiedStructureCandidate")
    if isinstance(structure, dict):
        inchi_key = normalized_optional(structure.get("inchiKey"))
        if inchi_key and INCHIKEY_PATTERN.fullmatch(inchi_key.upper()):
            inchi_keys = (inchi_key.upper(),)

    identifiers = tuple(sorted(
        [*(f"INCHIKEY:{value}" for value in inchi_keys), *(f"CAS:{value}" for value in cas_values), *(f"NAME:{value}" for value in names)]
    ))
    if not identifiers:
        return None, ["IDENTITY_LOOKUP_KEY_MISSING"], provenance_dilution

    return {
        "sourceRowId": str(item.get("sourceRowId", "")),
        "sourceRowNumber": item.get("sourceRowNumber"),
        "sourceClassification": classification,
        "identifiers": identifiers,
        "casValues": cas_values,
        "inchiKeys": inchi_keys,
        "normalizedNames": names,
    }, [], provenance_dilution


def collect_unique_identity_candidates(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Collapse source rows into connected identity-hint groups before lookup."""
    entries: list[dict[str, Any]] = []
    review_reasons: dict[str, list[str]] = {}
    dilution_evidence: dict[str, dict[str, Any]] = {}

    for item in results:
        row_id = str(item.get("sourceRowId", ""))
        candidate, reasons, dilution = _lookup_candidate(item)
        if reasons:
            review_reasons[row_id] = sorted(set(reasons))
        if dilution is not None:
            dilution_evidence[row_id] = dilution
        if candidate is not None:
            entries.append(candidate)

    disjoint = _DisjointSet(len(entries))
    identifier_owner: dict[str, int] = {}
    for index, entry in enumerate(entries):
        for identifier in entry["identifiers"]:
            previous = identifier_owner.setdefault(identifier, index)
            disjoint.union(index, previous)

    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for index, entry in enumerate(entries):
        grouped[disjoint.find(index)].append(entry)

    groups = sorted(
        grouped.values(),
        key=lambda group: min((entry.get("sourceRowNumber") or 10**12, entry["sourceRowId"]) for entry in group),
    )
    candidates: list[dict[str, Any]] = []
    row_to_candidate: dict[str, str] = {}
    for number, group in enumerate(groups, start=1):
        identifiers = sorted({value for entry in group for value in entry["identifiers"]})
        row_ids = sorted({entry["sourceRowId"] for entry in group})
        candidate_id = f"GLOBAL-CANDIDATE-{number:05d}"
        candidate = {
            "candidateId": candidate_id,
            "lookupKeys": identifiers,
            "casValues": sorted({value for entry in group for value in entry["casValues"]}),
            "inchiKeys": sorted({value for entry in group for value in entry["inchiKeys"]}),
            "normalizedNames": sorted({value for entry in group for value in entry["normalizedNames"]}),
            "sourceRowIds": row_ids,
            "sourceClassifications": sorted({entry["sourceClassification"] for entry in group}),
        }
        candidates.append(candidate)
        for row_id in row_ids:
            row_to_candidate[row_id] = candidate_id

    return {
        "candidates": candidates,
        "rowToCandidate": row_to_candidate,
        "preResolutionReviewReasons": review_reasons,
        "dilutionEvidence": dilution_evidence,
        "lookupCandidateSourceRowCount": len(entries),
        "uniqueLookupCandidateCount": len(candidates),
        "deduplicatedLookupCount": len(entries) - len(candidates),
    }


def _identity_record(record: dict[str, Any]) -> dict[str, Any] | None:
    status = normalized_name(record.get("lifecycleStatus") or record.get("status"))
    verification = normalized_name(record.get("verificationStatus"))
    if status != "ACTIVE" or verification != "VERIFIED":
        return None

    identity_id = normalized_optional(record.get("identityId"))
    preferred_name = normalized_optional(record.get("preferredName"))
    canonical_smiles = normalized_optional(record.get("canonicalSmiles"))
    isomeric_smiles = normalized_optional(record.get("isomericSmiles"))
    inchi = normalized_optional(record.get("inchi"))
    inchi_key = normalized_optional(record.get("inchiKey"))
    molecular_formula = normalized_optional(record.get("molecularFormula"))
    molecular_weight = record.get("molecularWeight")
    exact_mass = record.get("exactMass")
    structure_hash = normalized_optional(record.get("structureHash"))
    standardization_version = normalized_optional(record.get("standardizationVersion"))
    rdkit_version = normalized_optional(record.get("rdkitVersion"))
    evidence_records = record.get("evidenceRecords")
    if (
        not identity_id
        or not preferred_name
        or not canonical_smiles
        or not isomeric_smiles
        or not inchi
        or not inchi_key
        or not molecular_formula
        or not isinstance(molecular_weight, (int, float))
        or isinstance(molecular_weight, bool)
        or molecular_weight <= 0
        or not isinstance(exact_mass, (int, float))
        or isinstance(exact_mass, bool)
        or exact_mass <= 0
        or not structure_hash
        or re.fullmatch(r"[a-f0-9]{64}", structure_hash) is None
        or not standardization_version
        or not rdkit_version
        or not isinstance(evidence_records, list)
        or not evidence_records
    ):
        raise PrecheckError("VERIFIED_ACTIVE_IDENTITY_CONTRACT_INCOMPLETE")
    inchi_key = inchi_key.upper()
    if INCHIKEY_PATTERN.fullmatch(inchi_key) is None:
        raise PrecheckError("VERIFIED_ACTIVE_IDENTITY_INCHIKEY_INVALID")

    normalized_evidence: list[dict[str, str]] = []
    evidence_version_keys: set[tuple[str, str]] = set()
    for evidence in evidence_records:
        if not isinstance(evidence, dict):
            raise PrecheckError("VERIFIED_ACTIVE_IDENTITY_EVIDENCE_INVALID")
        source_kind = normalized_name(evidence.get("sourceKind"))
        source_ref = normalized_optional(evidence.get("sourceRef"))
        source_version = normalized_optional(evidence.get("sourceVersion"))
        content_hash = normalized_optional(evidence.get("contentHash"))
        if (
            source_kind not in {
                "AUTHORITATIVE_PUBLIC_DATABASE",
                "SUPPLIER_DOCUMENT",
                "CURATOR_ASSERTION",
            }
            or not source_ref
            or not source_version
            or not content_hash
            or re.fullmatch(r"[a-f0-9]{64}", content_hash) is None
        ):
            raise PrecheckError("VERIFIED_ACTIVE_IDENTITY_EVIDENCE_INVALID")
        version_key = (source_kind, source_version)
        if version_key in evidence_version_keys:
            raise PrecheckError("VERIFIED_ACTIVE_IDENTITY_EVIDENCE_VERSION_DUPLICATED")
        evidence_version_keys.add(version_key)
        normalized_evidence.append({
            "sourceKind": source_kind,
            "sourceRef": source_ref,
            "sourceVersion": source_version,
            "contentHash": content_hash,
        })

    cas_values = sorted({
        str(value).strip()
        for value in record.get("casNumbers", [])
        if cas_checksum_valid(str(value).strip())
    })
    aliases = sorted({
        normalized_name(value)
        for value in [preferred_name, *record.get("aliases", []), *record.get("synonyms", [])]
        if normalized_optional(value)
    })
    return {
        "identityId": identity_id,
        "preferredName": preferred_name,
        "canonicalSmiles": canonical_smiles,
        "isomericSmiles": isomeric_smiles,
        "inchi": inchi,
        "inchiKey": inchi_key,
        "molecularFormula": molecular_formula,
        "molecularWeight": molecular_weight,
        "exactMass": exact_mass,
        "structureHash": structure_hash,
        "standardizationVersion": standardization_version,
        "rdkitVersion": rdkit_version,
        "casNumbers": cas_values,
        "aliases": aliases,
        "evidenceRecords": sorted(
            normalized_evidence,
            key=lambda value: (
                value["sourceKind"],
                value["sourceVersion"],
                value["sourceRef"],
            ),
        ),
        "canonicalMaterialKey": normalized_optional(record.get("canonicalMaterialKey")) or f"INCHIKEY:{inchi_key}",
        "lifecycleStatus": "ACTIVE",
        "verificationStatus": "VERIFIED",
    }


def _verified_identity_index(records: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    eligible: dict[str, dict[str, Any]] = {}
    identifiers: dict[str, set[str]] = defaultdict(set)
    canonical_key_owner: dict[str, str] = {}
    ignored = 0
    for raw in records:
        identity = _identity_record(raw)
        if identity is None:
            ignored += 1
            continue
        identity_id = identity["identityId"]
        if identity_id in eligible:
            raise PrecheckError("VERIFIED_IDENTITY_ID_DUPLICATED")
        canonical_key = identity["canonicalMaterialKey"]
        if canonical_key in canonical_key_owner:
            raise PrecheckError("VERIFIED_CANONICAL_MATERIAL_KEY_DUPLICATED")
        canonical_key_owner[canonical_key] = identity_id
        eligible[identity_id] = identity
        identifiers[f"INCHIKEY:{identity['inchiKey']}"].add(identity_id)
        for value in identity["casNumbers"]:
            identifiers[f"CAS:{value}"].add(identity_id)
        for value in identity["aliases"]:
            identifiers[f"NAME:{value}"].add(identity_id)
    return eligible, identifiers, ignored


def _resolve_candidate(candidate: dict[str, Any], identifiers: dict[str, set[str]]) -> tuple[str | None, list[str]]:
    inchi_matches = [identifiers.get(f"INCHIKEY:{value}", set()) for value in candidate["inchiKeys"]]
    cas_matches = [identifiers.get(f"CAS:{value}", set()) for value in candidate["casValues"]]
    strong_matches = set().union(*(matches for matches in [*inchi_matches, *cas_matches] if matches))

    if len(strong_matches) > 1:
        return None, ["VERIFIED_STRONG_IDENTIFIER_CONFLICT"]
    if len(strong_matches) == 1:
        identity_id = next(iter(strong_matches))
        for matches in [*inchi_matches, *cas_matches]:
            if matches and identity_id not in matches:
                return None, ["VERIFIED_STRONG_IDENTIFIER_CONFLICT"]
        name_matches = set().union(*(
            identifiers.get(f"NAME:{value}", set())
            for value in candidate["normalizedNames"]
        )) if candidate["normalizedNames"] else set()
        if name_matches and identity_id not in name_matches and len(name_matches) == 1:
            return None, ["VERIFIED_NAME_IDENTIFIER_CONFLICT"]
        return identity_id, []

    name_matches = set().union(*(
        identifiers.get(f"NAME:{value}", set())
        for value in candidate["normalizedNames"]
    )) if candidate["normalizedNames"] else set()
    if len(name_matches) == 1:
        return next(iter(name_matches)), []
    if len(name_matches) > 1:
        return None, ["VERIFIED_NAME_IDENTITY_AMBIGUOUS"]
    return None, ["VERIFIED_ACTIVE_IDENTITY_NOT_FOUND"]


def _source_provenance(item: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceFileName": source.get("fileName"),
        "sourceFileSha256": source.get("fileSha256"),
        "sourceSheet": source.get("sheet"),
        "sourceRowId": item.get("sourceRowId"),
        "sourceRowNumber": item.get("sourceRowNumber"),
        "sourceCatalogNumber": item.get("sourceCatalogNumber"),
        "sourceSupplier": item.get("supplier"),
        "sourceSupplierProductCode": item.get("supplierProductCode"),
        "sourceInputName": item.get("inputName"),
        "sourceCategory": item.get("sourceCategory"),
        "sourceCasRaw": item.get("sourceCasRaw"),
    }


def validate_global_rebuild_plan(plan: dict[str, Any]) -> None:
    observations = plan.get("sourceObservations", [])
    source_rows = plan.get("counts", {}).get("SOURCE_ROWS")
    if source_rows != len(observations):
        raise PrecheckError("GLOBAL_SOURCE_ROW_ACCOUNTING_FAILED")

    row_ids = [item.get("sourceRowId") for item in observations]
    if any(not value for value in row_ids) or len(row_ids) != len(set(row_ids)):
        raise PrecheckError("GLOBAL_SOURCE_ROW_IDENTITY_FAILED")
    if any(item.get("disposition") not in GLOBAL_REBUILD_DISPOSITIONS for item in observations):
        raise PrecheckError("GLOBAL_SOURCE_DISPOSITION_INVALID")
    if plan["counts"].get("UNACCOUNTED_SOURCE_ROWS") != 0:
        raise PrecheckError("GLOBAL_SOURCE_ROWS_UNACCOUNTED")
    disposition_total = sum(plan["dispositionCounts"].get(value, 0) for value in GLOBAL_REBUILD_DISPOSITIONS)
    if disposition_total != source_rows:
        raise PrecheckError("GLOBAL_SOURCE_DISPOSITION_ACCOUNTING_FAILED")

    canonical_keys = [item.get("canonicalMaterialKey") for item in plan.get("canonicalMaterials", [])]
    if any(not value for value in canonical_keys) or len(canonical_keys) != len(set(canonical_keys)):
        raise PrecheckError("GLOBAL_CANONICAL_DUPLICATION_DETECTED")
    if plan["counts"].get("GLOBAL_DUPLICATE_CANONICAL_COUNT") != 0:
        raise PrecheckError("GLOBAL_CANONICAL_DUPLICATE_COUNT_NONZERO")
    for item in observations:
        if item["disposition"] in {"GLOBAL_CANONICAL_NEAT", "DILUTION_MERGED_TO_NEAT"} and not item.get("canonicalMaterialKey"):
            raise PrecheckError("GLOBAL_CANONICAL_LINK_MISSING")
        if item["disposition"] == "DILUTION_MERGED_TO_NEAT" and item.get("dilutionScientificallyEligible") is not False:
            raise PrecheckError("DILUTION_SCIENTIFIC_ELIGIBILITY_VIOLATION")


def build_global_rebuild_plan(precheck: dict[str, Any], verified_identities: list[dict[str, Any]]) -> dict[str, Any]:
    """Create an exhaustive global-catalog plan from prechecked source assertions."""
    source = precheck.get("source")
    results = precheck.get("results")
    if not isinstance(source, dict) or not isinstance(results, list):
        raise PrecheckError("GLOBAL_REBUILD_PRECHECK_CONTRACT_INVALID")
    expected_rows = source.get("rowCount")
    if expected_rows != len(results):
        raise PrecheckError("GLOBAL_REBUILD_PRECHECK_ROW_COUNT_MISMATCH")
    source_hash = normalized_optional(source.get("fileSha256"))
    if source_hash is None or re.fullmatch(r"[0-9a-fA-F]{64}", source_hash) is None:
        raise PrecheckError("GLOBAL_REBUILD_SOURCE_SHA256_REQUIRED")

    row_ids = [str(item.get("sourceRowId", "")) for item in results]
    if any(not value for value in row_ids) or len(row_ids) != len(set(row_ids)):
        raise PrecheckError("GLOBAL_REBUILD_SOURCE_ROW_IDS_INVALID")

    lookup = collect_unique_identity_candidates(results)
    identities, identity_index, ignored_identity_count = _verified_identity_index(verified_identities)
    resolutions: dict[str, dict[str, Any]] = {}
    for candidate in lookup["candidates"]:
        identity_id, reasons = _resolve_candidate(candidate, identity_index)
        resolutions[candidate["candidateId"]] = {
            "identityId": identity_id,
            "reasonCodes": reasons,
        }

    observations: list[dict[str, Any]] = []
    canonical_sources: dict[str, list[str]] = defaultdict(list)
    canonical_identities: dict[str, dict[str, Any]] = {}
    for item in results:
        row_id = str(item["sourceRowId"])
        classification = item.get("productClassification")
        candidate_id = lookup["rowToCandidate"].get(row_id)
        resolution = resolutions.get(candidate_id, {})
        identity = identities.get(resolution.get("identityId"))
        reasons = list(lookup["preResolutionReviewReasons"].get(row_id, []))
        reasons.extend(resolution.get("reasonCodes", []))
        dilution = lookup["dilutionEvidence"].get(row_id)

        if classification == "NATURAL":
            disposition = "EXCLUDED_NATURAL"
            reasons = ["NATURAL_COMPLEX_EXCLUDED_FROM_ACTIVE_GLOBAL_CATALOG"]
        elif classification in DEFERRED_MIXTURE_CLASSIFICATIONS:
            disposition = "DEFERRED_MIXTURE"
            reasons = [f"{classification}_DEFERRED_TO_COMPLEX_PRODUCT_MODEL"]
        elif classification == "BASE":
            disposition = "DEFERRED_BASE"
            reasons = ["PROPRIETARY_BASE_DEFERRED"]
        elif classification == "NEAT_SUBSTANCE" and identity is not None and not reasons:
            disposition = "GLOBAL_CANONICAL_NEAT"
            reasons = ["VERIFIED_ACTIVE_IDENTITY_RESOLVED"]
        elif classification == "DILUTION" and identity is not None and dilution is not None and not reasons:
            disposition = "DILUTION_MERGED_TO_NEAT"
            reasons = ["VERIFIED_ACTIVE_IDENTITY_RESOLVED", "DILUTION_PRESERVED_AS_SOURCE_OBSERVATION"]
        else:
            disposition = "REVIEW_REQUIRED"
            if not reasons:
                reasons = ["SOURCE_CLASSIFICATION_NOT_IN_ACTIVE_GLOBAL_RELEASE_SCOPE"]

        canonical_key = identity["canonicalMaterialKey"] if identity and disposition in {"GLOBAL_CANONICAL_NEAT", "DILUTION_MERGED_TO_NEAT"} else None
        if canonical_key:
            canonical_sources[canonical_key].append(row_id)
            canonical_identities[canonical_key] = identity

        observations.append({
            "sourceRowId": row_id,
            "sourceProductClassification": classification,
            "disposition": disposition,
            "canonicalMaterialKey": canonical_key,
            "verifiedIdentityId": identity["identityId"] if canonical_key else None,
            "reasonCodes": sorted(set(reasons)),
            "sourceProvenance": _source_provenance(item, source),
            "dilutionObservation": dilution,
            "dilutionScientificallyEligible": False if classification == "DILUTION" else None,
        })

    canonical_materials = [{
        "canonicalMaterialKey": key,
        "identityId": canonical_identities[key]["identityId"],
        "preferredName": canonical_identities[key]["preferredName"],
        "classification": "NEAT_SUBSTANCE",
        "lifecycleStatus": "ACTIVE",
        "verificationStatus": "VERIFIED",
        "canonicalSmiles": canonical_identities[key]["canonicalSmiles"],
        "isomericSmiles": canonical_identities[key]["isomericSmiles"],
        "inchi": canonical_identities[key]["inchi"],
        "inchiKey": canonical_identities[key]["inchiKey"],
        "molecularFormula": canonical_identities[key]["molecularFormula"],
        "molecularWeight": canonical_identities[key]["molecularWeight"],
        "exactMass": canonical_identities[key]["exactMass"],
        "structureHash": canonical_identities[key]["structureHash"],
        "standardizationVersion": canonical_identities[key]["standardizationVersion"],
        "rdkitVersion": canonical_identities[key]["rdkitVersion"],
        "casNumbers": canonical_identities[key]["casNumbers"],
        "evidenceRecords": canonical_identities[key]["evidenceRecords"],
        "sourceObservationIds": sorted(canonical_sources[key]),
    } for key in sorted(canonical_sources)]

    disposition_counts = {value: sum(item["disposition"] == value for item in observations) for value in GLOBAL_REBUILD_DISPOSITIONS}
    counts = {
        "SOURCE_ROWS": len(results),
        "ACCOUNTED_SOURCE_ROWS": len(observations),
        "UNACCOUNTED_SOURCE_ROWS": len(results) - len(observations),
        "GLOBAL_CANONICAL_NEAT_COUNT": len(canonical_materials),
        "GLOBAL_CANONICAL_NEAT_SOURCE_ROW_COUNT": disposition_counts["GLOBAL_CANONICAL_NEAT"],
        "DILUTION_SOURCE_COUNT": sum(item.get("productClassification") == "DILUTION" for item in results),
        "DILUTION_MERGED_TO_NEAT_COUNT": disposition_counts["DILUTION_MERGED_TO_NEAT"],
        "DILUTION_REVIEW_REQUIRED_COUNT": sum(
            item["sourceProductClassification"] == "DILUTION" and item["disposition"] == "REVIEW_REQUIRED"
            for item in observations
        ),
        "NATURAL_EXCLUDED_COUNT": disposition_counts["EXCLUDED_NATURAL"],
        "MIXTURE_DEFERRED_COUNT": disposition_counts["DEFERRED_MIXTURE"],
        "BASE_DEFERRED_COUNT": disposition_counts["DEFERRED_BASE"],
        "REVIEW_REQUIRED_SOURCE_ROW_COUNT": disposition_counts["REVIEW_REQUIRED"],
        "LOOKUP_CANDIDATE_SOURCE_ROW_COUNT": lookup["lookupCandidateSourceRowCount"],
        "UNIQUE_LOOKUP_CANDIDATE_COUNT": lookup["uniqueLookupCandidateCount"],
        "DEDUPLICATED_LOOKUP_COUNT": lookup["deduplicatedLookupCount"],
        "VERIFIED_ACTIVE_IDENTITY_INPUT_COUNT": len(identities),
        "IGNORED_NONACTIVE_OR_UNVERIFIED_IDENTITY_COUNT": ignored_identity_count,
        "GLOBAL_DUPLICATE_CANONICAL_COUNT": 0,
    }
    plan = {
        "contractVersion": CONTRACT_VERSION,
        "source": source,
        "safety": {
            "mode": "READ_ONLY_PLAN",
            "networkRequests": 0,
            "databaseWrites": 0,
            "sourceWorkbookWrites": 0,
            "nameOnlyStructureGuessingAllowed": False,
            "formulaToSmilesAllowed": False,
            "dilutionScientificallyEligibleAsNeat": False,
        },
        "counts": counts,
        "dispositionCounts": disposition_counts,
        "lookupPlan": {
            "candidates": lookup["candidates"],
            "candidateResolutions": resolutions,
            "deduplicatedBeforeResolution": True,
            "nonCandidateClassificationsExcludedBeforeResolution": True,
        },
        "canonicalMaterials": canonical_materials,
        "sourceObservations": observations,
    }
    validate_global_rebuild_plan(plan)
    return plan


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a read-only global Material Intelligence rebuild plan")
    parser.add_argument("--precheck", required=True, type=Path)
    parser.add_argument("--verified-identities", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        precheck = json.loads(args.precheck.read_text(encoding="utf-8"))
        registry = json.loads(args.verified_identities.read_text(encoding="utf-8"))
        if not isinstance(registry, list):
            raise PrecheckError("VERIFIED_IDENTITY_REGISTRY_MUST_BE_AN_ARRAY")
        plan = build_global_rebuild_plan(precheck, registry)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(stable_json(plan), encoding="utf-8", newline="\n")
        print("GLOBAL_REBUILD_PLAN=PASS")
        print(f"SOURCE_ROWS={plan['counts']['SOURCE_ROWS']}")
        print(f"UNACCOUNTED_SOURCE_ROWS={plan['counts']['UNACCOUNTED_SOURCE_ROWS']}")
        print(f"UNIQUE_LOOKUP_CANDIDATE_COUNT={plan['counts']['UNIQUE_LOOKUP_CANDIDATE_COUNT']}")
        return 0
    except (OSError, json.JSONDecodeError, PrecheckError, ValueError) as error:
        print(f"GLOBAL_REBUILD_PLAN=FAIL:{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
"""Leakage-safe preparation for the pinned Dravnieks Git LFS dataset.

Raw source bytes remain outside the repository. This module writes only derived,
content-addressed research artifacts to an operator-selected output directory.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem.Scaffolds import MurckoScaffold
from sklearn.linear_model import Ridge


RAW_SHA256 = "d560c47e9fc9fe8e802144be0c219e84594ef99611cfe1f7e4c861f38720edaf"
RAW_SIZE = 123443
SPLIT_SEED = 20260825
SPLIT_VERSION = "bemis-murcko-greedy/1.0.0"
NORMALIZATION_VERSION = "rdkit-isomeric/1.0.0"
TARGET_SELECTION_VERSION = "demo-schema-train-quality/1.0.0"
ECFP_VERSION = "rdkit-morgan-radius2-2048/1.0.0"

# This pool is fixed from dataset-native descriptor names before any test
# performance is observed. Train support and variance still determine inclusion.
DEMO_TARGET_POOL = (
    "regression_citrus",
    "regression_lemon",
    "regression_grapefruit",
    "regression_orange",
    "regression_fruity",
    "regression_floral",
    "regression_rose",
    "regression_lavender",
    "regression_musk",
    "regression_perfumery",
    "regression_fragrant",
    "regression_aromatic",
    "regression_resinous",
    "regression_cedarwood",
    "regression_eucalyptus",
    "regression_grass",
    "regression_herbal",
    "regression_sweet",
    "regression_vanilla",
    "regression_spicy",
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value: Any) -> str:
    payload = value if isinstance(value, bytes) else canonical_json(value).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def write_json(path: Path, value: Any) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = canonical_json(value) + "\n"
    path.write_text(payload, encoding="utf-8", newline="\n")
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _float_or_none(value: str) -> float | None:
    stripped = value.strip()
    if not stripped:
        return None
    parsed = float(stripped)
    if not math.isfinite(parsed):
        raise ValueError("Non-finite label")
    return parsed


def _scaffold(molecule: Chem.Mol, structure_hash: str) -> str:
    scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=molecule, includeChirality=True)
    return f"MURCKO:{scaffold}" if scaffold else f"ACYCLIC:{structure_hash}"


def _labels_equal(left: dict[str, float | None], right: dict[str, float | None]) -> bool:
    return all(left[key] == right[key] for key in left)


def normalize(raw_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any], list[str]]:
    raw = raw_path.read_bytes()
    if raw.startswith(b"version https://git-lfs.github.com/spec/v1"):
        raise ValueError("DATASET_LFS_POINTER")
    if len(raw) != RAW_SIZE or digest(raw) != RAW_SHA256:
        raise ValueError("DATASET_RAW_INTEGRITY_MISMATCH")

    with raw_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or reader.fieldnames[0] != "smiles":
            raise ValueError("DATASET_SCHEMA_INVALID")
        target_columns = reader.fieldnames[1:]
        raw_rows = list(reader)

    normalized: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    by_structure: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for offset, raw_row in enumerate(raw_rows, start=1):
        source_row_id = f"dravnieks-{offset:04d}"
        raw_smiles = raw_row["smiles"].strip()
        molecule = Chem.MolFromSmiles(raw_smiles)
        if molecule is None:
            rejected.append({"sourceRowId": source_row_id, "rawSmiles": raw_smiles, "status": "INVALID_SMILES"})
            continue
        try:
            Chem.SanitizeMol(molecule)
            canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
            non_isomeric = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=False)
            canonical_molecule = Chem.MolFromSmiles(canonical)
            inchi = Chem.MolToInchi(canonical_molecule) if canonical_molecule is not None else None
            inchikey = Chem.InchiToInchiKey(inchi) if inchi else None
            structure_hash = digest({"canonicalIsomericSmiles": canonical, "normalizationVersion": NORMALIZATION_VERSION})
            labels = {name: _float_or_none(raw_row[name]) for name in target_columns}
            record = {
                "sourceRowId": source_row_id,
                "rawSmiles": raw_smiles,
                "canonicalSmiles": canonical,
                "canonicalNonIsomericSmiles": non_isomeric,
                "inchi": inchi,
                "inchikey": inchikey,
                "structureHash": structure_hash,
                "scaffoldGroup": _scaffold(molecule, structure_hash),
                "normalizationStatus": "VALID",
                "normalizationReason": None,
                "labels": labels,
            }
            normalized.append(record)
            by_structure[canonical].append(record)
        except (ValueError, RuntimeError) as error:
            rejected.append({
                "sourceRowId": source_row_id,
                "rawSmiles": raw_smiles,
                "status": "UNSUPPORTED_STRUCTURE",
                "reasonClass": type(error).__name__,
            })

    duplicate_groups = 0
    conflicting_groups = 0
    excluded_ids: set[str] = set()
    for records in by_structure.values():
        if len(records) < 2:
            continue
        duplicate_groups += 1
        reference = records[0]
        if all(_labels_equal(reference["labels"], item["labels"]) for item in records[1:]):
            for duplicate in records[1:]:
                duplicate["normalizationStatus"] = "DUPLICATE_STRUCTURE"
                duplicate["normalizationReason"] = f"same_as:{reference['sourceRowId']}"
                excluded_ids.add(duplicate["sourceRowId"])
        else:
            conflicting_groups += 1
            for conflict in records:
                conflict["normalizationStatus"] = "CONFLICTING_DUPLICATE"
                conflict["normalizationReason"] = "excluded_without_label_merge"
                excluded_ids.add(conflict["sourceRowId"])

    model_rows = [row for row in normalized if row["sourceRowId"] not in excluded_ids]
    report = {
        "schemaVersion": "1.0.0",
        "normalizationVersion": NORMALIZATION_VERSION,
        "rawRowCount": len(raw_rows),
        "parsedRowCount": len(normalized),
        "modelRowCount": len(model_rows),
        "rejectedRowCount": len(rejected) + len(excluded_ids),
        "invalidStructureCount": len(rejected),
        "duplicateStructureGroupCount": duplicate_groups,
        "conflictingDuplicateGroupCount": conflicting_groups,
        "exactIsomericIdentityCount": len({row["canonicalSmiles"] for row in normalized}),
        "nonIsomericIdentityCount": len({row["canonicalNonIsomericSmiles"] for row in normalized}),
        "rejected": rejected,
    }
    return model_rows, report, target_columns


def split_rows(rows: list[dict[str, Any]]) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["scaffoldGroup"]].append(row)

    total = len(rows)
    desired = {"TRAIN": total * 0.60, "VALIDATION": total * 0.20, "TEST": total * 0.20}
    partitions = {"TRAIN": [], "VALIDATION": [], "TEST": []}
    group_ids = {"TRAIN": [], "VALIDATION": [], "TEST": []}
    ordered_groups = sorted(grouped.items(), key=lambda item: (-len(item[1]), digest({"seed": SPLIT_SEED, "group": item[0]})))
    for group, members in ordered_groups:
        partition = min(partitions, key=lambda name: (len(partitions[name]) / max(desired[name], 1.0), name))
        partitions[partition].extend(members)
        group_ids[partition].append(group)

    for values in partitions.values():
        values.sort(key=lambda row: row["sourceRowId"])

    canonical_sets = {name: {row["canonicalSmiles"] for row in values} for name, values in partitions.items()}
    scaffold_sets = {name: {row["scaffoldGroup"] for row in values} for name, values in partitions.items()}
    pairs = (("TRAIN", "VALIDATION"), ("TRAIN", "TEST"), ("VALIDATION", "TEST"))
    canonical_overlap = sum(len(canonical_sets[left] & canonical_sets[right]) for left, right in pairs)
    scaffold_overlap = sum(len(scaffold_sets[left] & scaffold_sets[right]) for left, right in pairs)
    if canonical_overlap or scaffold_overlap or any(not values for values in partitions.values()):
        raise ValueError("TRAINING_DATA_LEAKAGE_UNRESOLVED")

    manifest: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "seed": SPLIT_SEED,
        "algorithmVersion": SPLIT_VERSION,
        "partitions": {},
        "canonicalOverlapCount": canonical_overlap,
        "scaffoldOverlapCount": scaffold_overlap,
        "leakageStatus": "PASS",
    }
    for name in ("TRAIN", "VALIDATION", "TEST"):
        manifest["partitions"][name] = {
            "rowIds": [row["sourceRowId"] for row in partitions[name]],
            "structureHashes": [row["structureHash"] for row in partitions[name]],
            "groupHash": digest(sorted(group_ids[name])),
            "rowCount": len(partitions[name]),
        }
    manifest["splitManifestHash"] = digest(manifest)
    return partitions, manifest


def select_targets(partitions: dict[str, list[dict[str, Any]]], all_targets: list[str]) -> dict[str, Any]:
    unknown = [target for target in DEMO_TARGET_POOL if target not in all_targets]
    if unknown:
        raise ValueError(f"TARGET_SCHEMA_MISMATCH:{','.join(unknown)}")
    train = partitions["TRAIN"]
    target_records = []
    selected = []
    minimum_support = max(10, math.ceil(len(train) * 0.50))
    for target in DEMO_TARGET_POOL:
        values = {name: [row["labels"][target] for row in rows if row["labels"][target] is not None] for name, rows in partitions.items()}
        train_values = np.asarray(values["TRAIN"], dtype=np.float64)
        variance = float(np.var(train_values)) if train_values.size else 0.0
        support = len(values["TRAIN"])
        eligible = support >= minimum_support and variance > 1e-12
        if eligible:
            selected.append(target)
        target_records.append({
            "targetName": target,
            "displayName": target.removeprefix("regression_").replace("_", " ").title(),
            "rawScale": "dataset descriptor response score, source range 0-1; not a probability",
            "trainSupport": support,
            "validationSupport": len(values["VALIDATION"]),
            "testSupport": len(values["TEST"]),
            "trainMissingRate": 1.0 - support / len(train),
            "trainVariance": variance,
            "selectionStatus": "SELECTED" if eligible else "EXCLUDED",
            "selectionReason": "schema-prior demo descriptor with sufficient train support and variance" if eligible else "insufficient train support or variance",
        })
    if not selected or len(selected) > 20:
        raise ValueError("TARGET_SELECTION_INVALID")
    manifest: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "selectionVersion": TARGET_SELECTION_VERSION,
        "selectionUsesTestPerformance": False,
        "selectedTargets": selected,
        "targetCount": len(selected),
        "targets": target_records,
    }
    manifest["targetManifestHash"] = digest(manifest)
    return manifest


def _metrics(actual: np.ndarray, predicted: np.ndarray, targets: list[str]) -> dict[str, Any]:
    per_target = []
    for index, target in enumerate(targets):
        mask = np.isfinite(actual[:, index])
        errors = predicted[mask, index] - actual[mask, index]
        per_target.append({
            "target": target,
            "n": int(mask.sum()),
            "mae": float(np.mean(np.abs(errors))),
            "rmse": float(np.sqrt(np.mean(np.square(errors)))),
        })
    return {
        "aggregation": "MACRO_UNWEIGHTED",
        "mae": float(np.mean([item["mae"] for item in per_target])),
        "rmse": float(np.mean([item["rmse"] for item in per_target])),
        "perTarget": per_target,
    }


def _matrix(rows: list[dict[str, Any]], targets: list[str]) -> np.ndarray:
    return np.asarray([[np.nan if row["labels"][target] is None else row["labels"][target] for target in targets] for row in rows], dtype=np.float64)


def _ecfp(rows: list[dict[str, Any]], bits: int = 2048) -> np.ndarray:
    features = np.zeros((len(rows), bits), dtype=np.float32)
    for row_index, row in enumerate(rows):
        molecule = Chem.MolFromSmiles(row["canonicalSmiles"])
        fingerprint = AllChem.GetMorganFingerprintAsBitVect(molecule, radius=2, nBits=bits)
        Chem.DataStructs.ConvertToNumpyArray(fingerprint, features[row_index])
    return features


def validation_baselines(partitions: dict[str, list[dict[str, Any]]], targets: list[str]) -> dict[str, Any]:
    train_y = _matrix(partitions["TRAIN"], targets)
    validation_y = _matrix(partitions["VALIDATION"], targets)
    means = np.nanmean(train_y, axis=0)
    mean_prediction = np.tile(means, (len(validation_y), 1))

    train_x = _ecfp(partitions["TRAIN"])
    validation_x = _ecfp(partitions["VALIDATION"])
    ecfp_prediction = np.empty_like(validation_y)
    for index in range(len(targets)):
        mask = np.isfinite(train_y[:, index])
        model = Ridge(alpha=1.0).fit(train_x[mask], train_y[mask, index])
        ecfp_prediction[:, index] = model.predict(validation_x)
    report: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "partition": "VALIDATION",
        "testPerformanceObserved": False,
        "trainMean": {
            "baselineName": "TRAIN_MEAN",
            "featureVersion": "none",
            "metrics": _metrics(validation_y, mean_prediction, targets),
        },
        "ecfpRidge": {
            "baselineName": "ECFP_RIDGE",
            "featureVersion": ECFP_VERSION,
            "alpha": 1.0,
            "metrics": _metrics(validation_y, ecfp_prediction, targets),
        },
    }
    report["artifactHash"] = digest(report)
    return report


def prepare(raw_path: Path, output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    rows, normalization_report, all_targets = normalize(raw_path)
    partitions, split_manifest = split_rows(rows)
    target_manifest = select_targets(partitions, all_targets)
    targets = target_manifest["selectedTargets"]

    normalized_payload = "".join(canonical_json(row) + "\n" for row in rows)
    normalized_path = output_dir / "normalized_records.jsonl"
    normalized_path.write_text(normalized_payload, encoding="utf-8", newline="\n")
    transformed_hash = hashlib.sha256(normalized_payload.encode("utf-8")).hexdigest()

    write_json(output_dir / "normalization_report.json", normalization_report)
    write_json(output_dir / "split_manifest.json", split_manifest)
    write_json(output_dir / "target_manifest.json", target_manifest)
    baseline_report = validation_baselines(partitions, targets)
    write_json(output_dir / "baseline_validation.json", baseline_report)

    partition_hashes = {}
    for name, values in partitions.items():
        path = output_dir / f"{name.lower()}.csv"
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=["source_row_id", "smiles", *targets])
            writer.writeheader()
            for row in values:
                writer.writerow({"source_row_id": row["sourceRowId"], "smiles": row["canonicalSmiles"], **{target: row["labels"][target] for target in targets}})
        partition_hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()

    transformations = [
        {
            "transformationKey": "VALIDATED_RAW",
            "transformationVersion": "raw-integrity/1.0.0",
            "codeRef": "services/scientific/model-runtime/osmo_demo/data_pipeline.py",
            "configurationHash": digest({"rawSha256": RAW_SHA256, "rawSize": RAW_SIZE}),
            "inputHash": RAW_SHA256,
            "outputHash": digest(normalization_report),
        },
        {
            "transformationKey": "NORMALIZED",
            "transformationVersion": NORMALIZATION_VERSION,
            "codeRef": "services/scientific/model-runtime/osmo_demo/data_pipeline.py",
            "configurationHash": digest({"isomeric": True, "deduplicate": "exclude conflicts; retain first identical"}),
            "inputHash": RAW_SHA256,
            "outputHash": transformed_hash,
        },
        {
            "transformationKey": "SPLIT_MANIFESTS",
            "transformationVersion": SPLIT_VERSION,
            "codeRef": "services/scientific/model-runtime/osmo_demo/data_pipeline.py",
            "configurationHash": digest({"seed": SPLIT_SEED, "proportions": [0.6, 0.2, 0.2]}),
            "inputHash": transformed_hash,
            "outputHash": split_manifest["splitManifestHash"],
        },
        {
            "transformationKey": "MODEL_INPUTS",
            "transformationVersion": TARGET_SELECTION_VERSION,
            "codeRef": "services/scientific/model-runtime/osmo_demo/data_pipeline.py",
            "configurationHash": target_manifest["targetManifestHash"],
            "inputHash": transformed_hash,
            "outputHash": digest(partition_hashes),
        },
    ]
    transformation_manifest = {"schemaVersion": "1.0.0", "transformations": transformations, "partitionHashes": partition_hashes}
    transformation_manifest["contentHash"] = digest(transformation_manifest)
    write_json(output_dir / "transformation_manifest.json", transformation_manifest)

    summary = {
        "datasetRawSha256": RAW_SHA256,
        "datasetTransformedSha256": transformed_hash,
        "normalization": normalization_report,
        "split": split_manifest,
        "targets": target_manifest,
        "baselineValidation": baseline_report,
        "transformationManifest": transformation_manifest,
    }
    write_json(output_dir / "preparation_summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.raw, args.output_dir)
    print(f"DATASET_PREPARATION=PASS")
    print(f"LEAKAGE_STATUS={result['split']['leakageStatus']}")
    print(f"TARGET_COUNT={result['targets']['targetCount']}")


if __name__ == "__main__":
    main()

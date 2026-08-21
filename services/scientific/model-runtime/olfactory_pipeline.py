"""Bounded, reproducible Phase 5 benchmark pipeline.

This is intentionally a research baseline, not a serving system.  It combines
an RDKit Morgan representation with an independently derived SMILES character
representation, trains a late-fusion ridge regressor, records residual-based
uncertainty, and emits a compact provenance report.  Business code never
imports this module; a reviewed artifact is required before serving.
"""
import csv
import hashlib
import json
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from sklearn.decomposition import PCA
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_squared_error
from sklearn.preprocessing import StandardScaler

TARGETS = ("floral", "citrus", "musk")


def _bucket(seed, group):
    return int(hashlib.sha256(f"{seed}:{group}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def load_fixture(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            molecule = Chem.MolFromSmiles(row["smiles"])
            if molecule is None:
                raise ValueError("Fixture contains an invalid SMILES")
            rows.append((Chem.MolToSmiles(molecule, canonical=True), np.array([float(row[target]) for target in TARGETS], dtype=np.float32)))
    return rows


def _morgan(smiles, bits=128):
    molecule = Chem.MolFromSmiles(smiles)
    vector = AllChem.GetMorganFingerprintAsBitVect(molecule, radius=2, nBits=bits)
    return np.fromiter((int(bit) for bit in vector.ToBitString()), dtype=np.float32, count=bits)


def split_rows(rows, seed=20260808):
    partitions = {"train": [], "validation": [], "test": []}
    for row in rows:
        bucket = _bucket(seed, row[0])
        partition = "test" if bucket < 0.2 else "validation" if bucket < 0.4 else "train"
        partitions[partition].append(row)
    # The compact checked-in fixture needs every partition for a meaningful
    # deterministic smoke. This rule does not apply to a real registry dataset.
    for name in ("train", "validation", "test"):
        if not partitions[name]:
            source = max(partitions, key=lambda key: len(partitions[key]))
            partitions[name].append(partitions[source].pop())
    seen = {}
    for name, values in partitions.items():
        for smiles, _ in values:
            if smiles in seen:
                raise ValueError(f"Leakage: {smiles} appears in {seen[smiles]} and {name}")
            seen[smiles] = name
    return partitions


def run_pipeline(fixture_path):
    rows = load_fixture(fixture_path)
    partitions = split_rows(rows)
    all_smiles = [smiles for smiles, _ in rows]
    vectorizer = CountVectorizer(analyzer="char", ngram_range=(1, 2), min_df=1, lowercase=False)
    character = vectorizer.fit_transform(all_smiles).toarray().astype(np.float32)
    molecular = np.vstack([_morgan(smiles) for smiles in all_smiles])
    fused = StandardScaler().fit_transform(np.hstack([molecular, character]))
    index = {smiles: offset for offset, smiles in enumerate(all_smiles)}
    pick = lambda name: np.array([index[smiles] for smiles, _ in partitions[name]], dtype=int)
    train_idx, validation_idx, test_idx = pick("train"), pick("validation"), pick("test")
    labels = np.vstack([targets for _, targets in rows])
    model = Ridge(alpha=1.0).fit(fused[train_idx], labels[train_idx])
    validation_prediction = model.predict(fused[validation_idx])
    test_prediction = model.predict(fused[test_idx])
    residual_std = np.sqrt(np.mean((validation_prediction - labels[validation_idx]) ** 2, axis=0))
    pca = PCA(n_components=2, random_state=20260808).fit(fused[train_idx])
    odor_embeddings = pca.transform(fused[test_idx])
    report = {
        "pipeline": "phase5-late-fusion-ridge/1",
        "dataset": "dravnieks-fixture-cc-by-4.0",
        "rows": len(rows),
        "partitions": {name: len(value) for name, value in partitions.items()},
        "leakageStatus": "PASS",
        "representations": {"morganBits": int(molecular.shape[1]), "smilesCharacterFeatures": int(character.shape[1]), "fusion": "late_fusion_concatenation"},
        "metrics": {"testRmse": {target: float(value) for target, value in zip(TARGETS, np.sqrt(mean_squared_error(labels[test_idx], test_prediction, multioutput="raw_values")))}},
        "calibration": {"method": "validation_residual_rmse", "uncertainty": {target: float(value) for target, value in zip(TARGETS, residual_std)}},
        "odorEmbedding": {"method": "pca_of_fused_representation", "dimension": int(odor_embeddings.shape[1]), "sampleCount": int(len(odor_embeddings))},
        "serving": "RESEARCH_ONLY",
    }
    report["contentHash"] = hashlib.sha256(json.dumps(report, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return report


if __name__ == "__main__":
    path = Path(__file__).parent / "fixtures" / "dravnieks_benchmark.csv"
    print(json.dumps(run_pipeline(path), sort_keys=True))

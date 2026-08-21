"""Bounded adapters for pinned molecular structure and feature components.

This process intentionally accepts no tenant or authorization data. The V2 API
authorizes requests and persists tenant-scoped jobs/artifacts before calling it.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import math
from pathlib import Path
from typing import Any


class ScientificRuntimeError(RuntimeError):
    """Normalized error, safe for the gateway to classify without raw details."""


class InvalidSmilesError(ScientificRuntimeError):
    pass


class ComponentUnavailableError(ScientificRuntimeError):
    pass


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def _hash(value: Any) -> str:
    payload = value if isinstance(value, str) else _canonical_json(value)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _pins() -> dict[str, dict[str, str]]:
    path = Path(__file__).resolve().parents[1] / "component-pins.json"
    return json.loads(path.read_text(encoding="utf-8"))["components"]


class ScientificRuntimeService:
    """Adapter facade. There is no fallback that fabricates scientific evidence."""

    standardization_version = "olfactoryops-rdkit-standardization/1.0.0"

    def __init__(self) -> None:
        self._pins = _pins()

    @property
    def runtime_version(self) -> str:
        return "olfactoryops-scientific-runtime/phase3-1.0.0"

    def _rdkit(self):
        try:
            from rdkit import Chem, RDLogger, rdBase
        except Exception as error:  # pragma: no cover - deployment dependency
            raise ComponentUnavailableError("SCIENTIFIC_RUNTIME_NOT_CONFIGURED") from error
        # The gateway stores hashes, never raw SMILES. Suppress RDKit parser output
        # so malformed untrusted input cannot be echoed to runtime logs.
        RDLogger.DisableLog("rdApp.error")
        return Chem, rdBase

    def _structure(self, smiles: str) -> tuple[Any, dict[str, Any]]:
        Chem, rd_base = self._rdkit()
        raw = smiles.strip()
        if not raw or len(raw) > 4096 or any(ord(char) < 32 or ord(char) == 127 for char in raw):
            raise InvalidSmilesError("SCIENTIFIC_RUNTIME_INVALID_SMILES")
        molecule = Chem.MolFromSmiles(raw)
        if molecule is None:
            raise InvalidSmilesError("SCIENTIFIC_RUNTIME_INVALID_SMILES")
        try:
            Chem.SanitizeMol(molecule)
        except Exception as error:
            raise InvalidSmilesError("SCIENTIFIC_RUNTIME_INVALID_SMILES") from error
        canonical_smiles = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
        canonical_molecule = Chem.MolFromSmiles(canonical_smiles)
        if canonical_molecule is None:  # Defensive: an RDKit canonical output must be parseable.
            raise ScientificRuntimeError("SCIENTIFIC_RUNTIME_FAILED")
        inchi = None
        inchi_key = None
        try:
            inchi = Chem.MolToInchi(canonical_molecule)
            inchi_key = Chem.InchiToInchiKey(inchi) if inchi else None
        except Exception:
            # InChI availability varies by RDKit wheel. Its absence is explicit, not inferred.
            inchi = None
            inchi_key = None
        graph = {
            "atoms": [
                {"index": atom.GetIdx(), "symbol": atom.GetSymbol(), "atomicNumber": atom.GetAtomicNum()}
                for atom in canonical_molecule.GetAtoms()
            ],
            "bonds": [
                {"begin": bond.GetBeginAtomIdx(), "end": bond.GetEndAtomIdx(), "order": bond.GetBondTypeAsDouble()}
                for bond in canonical_molecule.GetBonds()
            ],
        }
        input_hash = _hash(raw)
        structure_hash = _hash({"canonicalSmiles": canonical_smiles, "standardizationVersion": self.standardization_version})
        output_hash = _hash({"canonicalSmiles": canonical_smiles, "inchi": inchi, "inchiKey": inchi_key, "structureHash": structure_hash, "molecularGraph": graph, "rdkitVersion": rd_base.rdkitVersion, "standardizationVersion": self.standardization_version})
        return canonical_molecule, {
            "canonicalSmiles": canonical_smiles,
            "inchi": inchi,
            "inchiKey": inchi_key,
            "structureHash": structure_hash,
            "inputHash": input_hash,
            "outputHash": output_hash,
            "molecularGraph": graph,
            "rdkitVersion": rd_base.rdkitVersion,
            "standardizationVersion": self.standardization_version,
        }

    def normalize(self, smiles: str) -> dict[str, Any]:
        _, structure = self._structure(smiles)
        return {"structure": structure, "artifacts": [], "runtimeVersion": self.runtime_version}

    def _artifact(self, kind: str, status: str, structure: dict[str, Any], payload: dict[str, Any], component_key: str | None = None) -> dict[str, Any]:
        component_key = component_key or kind
        pin = self._pins[component_key]
        content_hash = _hash({"kind": kind, "schemaVersion": "1.0.0", "structureHash": structure["structureHash"], "payload": payload, "component": pin["upstreamCommit"]})
        return {
            "kind": kind,
            "status": status,
            "schemaVersion": f"{kind.lower()}/1.0.0",
            "componentKey": component_key,
            "componentVersion": pin["adapterVersion"],
            "inputHash": structure["outputHash"],
            "contentHash": content_hash,
            "payload": payload,
            "provenance": [{
                "kind": "component",
                "id": kind,
                "version": pin["upstreamCommit"],
                "contentHash": _hash(pin),
                "sourceUri": pin["repository"],
            }],
        }

    def _ecfp(self, molecule: Any, structure: dict[str, Any]) -> dict[str, Any]:
        self._rdkit()
        try:
            from rdkit.Chem import rdFingerprintGenerator
            generator = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048, includeChirality=True)
            fingerprint = generator.GetFingerprint(molecule)
            on_bits = [int(bit) for bit in fingerprint.GetOnBits()]
        except Exception as error:  # pragma: no cover - depends on RDKit build details
            raise ScientificRuntimeError("SCIENTIFIC_RUNTIME_FAILED") from error
        return self._artifact("ECFP", "VERIFIED", structure, {"radius": 2, "bitLength": 2048, "onBits": on_bits, "onBitCount": len(on_bits)}, "RDKIT")

    def _bcfp(self, molecule: Any, structure: dict[str, Any]) -> dict[str, Any]:
        try:
            module = importlib.import_module("bcfp")
            generator = module.FingerprintGenerator(hash_func="blake3", fp_type="bcfp", radius=2, n_bits=2048, use_counts=False)
            values = generator.generate_basic(molecule)
            on_bits = [index for index, value in enumerate(values.tolist()) if float(value) != 0.0]
            return self._artifact("BCFP", "VERIFIED", structure, {"radius": 2, "bitLength": 2048, "hashAlgorithm": "blake3", "onBits": on_bits, "onBitCount": len(on_bits)})
        except Exception:
            return self._artifact("BCFP", "NOT_CONFIGURED", structure, {"reason": "Pinned BCFP native runtime is not installed or did not pass its compatibility check."})

    def _molftp(self, molecule: Any, structure: dict[str, Any], target_context: dict[str, Any] | None) -> dict[str, Any]:
        if not target_context:
            return self._artifact("MOLFTP", "NOT_EVALUATED", structure, {"reason": "MolFTP requires a registered target dataset and verified labels. No target context was supplied."})
        smiles = target_context.get("smiles")
        labels = target_context.get("labels")
        dataset = target_context.get("dataset")
        if not isinstance(smiles, list) or not isinstance(labels, list) or len(smiles) < 2 or len(smiles) != len(labels) or not isinstance(dataset, dict):
            return self._artifact("MOLFTP", "NOT_EVALUATED", structure, {"reason": "Target context is not a valid registered dataset with aligned labels."})
        if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in labels):
            return self._artifact("MOLFTP", "NOT_EVALUATED", structure, {"reason": "Target labels are incomplete or invalid."})
        try:
            import numpy as np
            module = importlib.import_module("molftp")
            generator = module.MultiTaskPrevalenceGenerator(radius=6, method="key_loo", key_loo_k=2, num_threads=1)
            generator.fit(smiles, np.asarray(labels, dtype=float).reshape(-1, 1), task_names=[str(dataset["id"])])
            values = generator.transform([structure["canonicalSmiles"]])[0].tolist()
            return self._artifact("MOLFTP", "VERIFIED", structure, {"dataset": {"id": str(dataset["id"]), "version": str(dataset["version"]), "checksum": str(dataset["checksum"])}, "method": "key_loo", "radius": 6, "values": values, "dimensions": len(values)})
        except Exception:
            return self._artifact("MOLFTP", "NOT_CONFIGURED", structure, {"reason": "Pinned MolFTP native runtime is not installed or did not pass its compatibility check."})

    def _osmordred(self, molecule: Any, structure: dict[str, Any]) -> dict[str, Any]:
        try:
            descriptors = importlib.import_module("osmordred")
            values = {
                "weight": list(descriptors.CalcWeight(molecule)),
                "topoPsa": list(descriptors.CalcTopoPSA(molecule)),
                "slogP": list(descriptors.CalcSLogP(molecule)),
                "bertzCt": list(descriptors.CalcBertzCT(molecule)),
                "balabanJ": list(descriptors.CalcBalabanJ(molecule)),
            }
            return self._artifact("OSMORDRED", "VERIFIED", structure, {"profile": "phase3-curated-0d-2d-v1", "values": values, "descriptorCount": sum(len(value) for value in values.values())})
        except Exception:
            return self._artifact("OSMORDRED", "NOT_CONFIGURED", structure, {"reason": "Pinned Osmordred runtime is isolated because it requires a patched RDKit 2023.09.3 build."})

    def generate_features(self, canonical_smiles: str, feature_kinds: list[str], target_context: dict[str, Any] | None = None) -> dict[str, Any]:
        molecule, structure = self._structure(canonical_smiles)
        selected = list(dict.fromkeys(feature_kinds))
        if not selected or any(kind not in {"ECFP", "BCFP", "MOLFTP", "OSMORDRED"} for kind in selected):
            raise ScientificRuntimeError("SCIENTIFIC_RUNTIME_INVALID_FEATURE_REQUEST")
        artifact_by_kind = {
            "ECFP": lambda: self._ecfp(molecule, structure),
            "BCFP": lambda: self._bcfp(molecule, structure),
            "MOLFTP": lambda: self._molftp(molecule, structure, target_context),
            "OSMORDRED": lambda: self._osmordred(molecule, structure),
        }
        return {"structure": structure, "artifacts": [artifact_by_kind[kind]() for kind in selected], "runtimeVersion": self.runtime_version}

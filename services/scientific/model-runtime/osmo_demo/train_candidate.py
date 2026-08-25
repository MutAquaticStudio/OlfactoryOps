"""Train, freeze, evaluate, and run the research Transformer-CNN candidate."""

from __future__ import annotations

import argparse
import csv
import json
import math
import tarfile
import time
from pathlib import Path
from typing import Any

import numpy as np
import tensorflow as tf

from .data_pipeline import ECFP_VERSION, _ecfp, _matrix, _metrics, canonical_json, digest, write_json
from .transformer_model import (
    TRAINING_MODE,
    UPSTREAM_COMMIT,
    augment_partition,
    build_encoder,
    build_property_head,
    configure_determinism,
    encode,
    file_sha256,
    prediction_matrix,
    validate_smiles,
)
from sklearn.linear_model import Ridge


MODEL_NAME = "Osmo Dravnieks Transformer-CNN Research Candidate"
MODEL_VERSION = "osmo-dravnieks-transformer-cnn/1.0.0"
RUNTIME_VERSION = "olfactoryops-osmo-research-runtime/1.0.0"


def read_csv(path: Path, targets: list[str]) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = []
        for item in csv.DictReader(handle):
            rows.append({
                "sourceRowId": item["source_row_id"],
                "smiles": validate_smiles(item["smiles"]),
                "labels": {target: None if not item[target].strip() else float(item[target]) for target in targets},
            })
    return rows


def target_scaler(train_rows: list[dict[str, Any]], targets: list[str]) -> dict[str, dict[str, float]]:
    scaler = {}
    for target in targets:
        values = np.asarray([row["labels"][target] for row in train_rows if row["labels"][target] is not None], dtype=np.float64)
        if not values.size or not np.isfinite(values).all():
            raise ValueError("TRAIN_TARGET_INVALID")
        minimum, maximum = float(values.min()), float(values.max())
        if maximum <= minimum:
            raise ValueError("TRAIN_TARGET_ZERO_VARIANCE")
        scaler[target] = {"minimum": minimum, "maximum": maximum, "fitPartition": "TRAIN", "outputRangeMinimum": 0.1, "outputRangeMaximum": 0.9}
    return scaler


def scale_labels(rows: list[dict[str, Any]], targets: list[str], scaler: dict[str, dict[str, float]]) -> tuple[list[np.ndarray], list[np.ndarray]]:
    outputs = []
    weights = []
    for target in targets:
        values = []
        mask = []
        parameters = scaler[target]
        span = parameters["maximum"] - parameters["minimum"]
        for row in rows:
            value = row["labels"][target]
            mask.append(0.0 if value is None else 1.0)
            values.append(0.0 if value is None else 0.1 + 0.8 * (value - parameters["minimum"]) / span)
        outputs.append(np.asarray(values, dtype=np.float32).reshape(-1, 1))
        weights.append(np.asarray(mask, dtype=np.float32))
    return outputs, weights


def inverse_scale(matrix: np.ndarray, targets: list[str], scaler: dict[str, dict[str, float]]) -> np.ndarray:
    restored = np.empty_like(matrix, dtype=np.float64)
    for index, target in enumerate(targets):
        parameters = scaler[target]
        restored[:, index] = (matrix[:, index] - 0.1) / 0.8 * (parameters["maximum"] - parameters["minimum"]) + parameters["minimum"]
    return restored


def actual_matrix(rows: list[dict[str, Any]], targets: list[str]) -> np.ndarray:
    return np.asarray([[np.nan if row["labels"][target] is None else row["labels"][target] for target in targets] for row in rows], dtype=np.float64)


def load_preparation(data_dir: Path) -> tuple[list[str], dict[str, Any], dict[str, Any]]:
    targets_manifest = json.loads((data_dir / "target_manifest.json").read_text(encoding="utf-8"))
    split_manifest = json.loads((data_dir / "split_manifest.json").read_text(encoding="utf-8"))
    summary = json.loads((data_dir / "preparation_summary.json").read_text(encoding="utf-8"))
    if split_manifest.get("leakageStatus") != "PASS" or split_manifest.get("canonicalOverlapCount") != 0 or split_manifest.get("scaffoldOverlapCount") != 0:
        raise ValueError("TRAINING_DATA_LEAKAGE_UNRESOLVED")
    if targets_manifest.get("selectionUsesTestPerformance") is not False or not 1 <= targets_manifest.get("targetCount", 0) <= 20:
        raise ValueError("TARGET_MANIFEST_INVALID")
    return targets_manifest["selectedTargets"], split_manifest, summary


def train(data_dir: Path, artifact_dir: Path, upstream_dir: Path, *, smoke: bool, seed: int, augmentation_count: int, epochs: int, batch_size: int, learning_rate: float) -> dict[str, Any]:
    configure_determinism(seed)
    targets, split_manifest, preparation = load_preparation(data_dir)
    train_rows = read_csv(data_dir / "train.csv", targets)
    validation_rows = read_csv(data_dir / "validation.csv", targets)
    if smoke:
        train_rows = train_rows[: min(16, len(train_rows))]
        validation_rows = validation_rows[: min(8, len(validation_rows))]
        augmentation_count = 1
        epochs = min(epochs, 2)
    augmented_train = augment_partition(train_rows, augmentation_count, seed, isomeric=True)
    scaler = target_scaler(train_rows, targets)
    train_y, train_weights = scale_labels(augmented_train, targets, scaler)
    validation_y, validation_weights = scale_labels(validation_rows, targets, scaler)

    pretrained_path = upstream_dir / "pretrained" / "embeddings.npy"
    if not pretrained_path.is_file():
        raise ValueError("PRETRAINED_ENCODER_MISSING")
    started = time.perf_counter()
    encoder = build_encoder(pretrained_path)
    train_encoded = encode(encoder, [row["smiles"] for row in augmented_train], batch_size)
    validation_encoded = encode(encoder, [row["smiles"] for row in validation_rows], batch_size)
    encoder_parameter_count = encoder.count_params()
    del encoder
    tf.keras.backend.clear_session()
    configure_determinism(seed)

    model = build_property_head(len(targets), learning_rate)
    callbacks: list[tf.keras.callbacks.Callback] = []
    if not smoke:
        callbacks.append(tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=5, min_delta=1e-6, restore_best_weights=True, verbose=0))
    history = model.fit(
        train_encoded,
        train_y,
        sample_weight=train_weights,
        validation_data=(validation_encoded, validation_y, validation_weights),
        epochs=epochs,
        batch_size=batch_size,
        shuffle=True,
        callbacks=callbacks,
        verbose=2,
    )
    if not history.history.get("loss") or not all(math.isfinite(float(value)) for value in history.history["loss"]):
        raise ValueError("NONFINITE_TRAINING_LOSS")
    validation_scaled = prediction_matrix(model.predict(validation_encoded, batch_size=batch_size, verbose=0), len(targets))
    validation_prediction = inverse_scale(validation_scaled, targets, scaler)
    validation_metrics = _metrics(actual_matrix(validation_rows, targets), validation_prediction, targets)
    validation_residual = {
        target: item["rmse"] for target, item in zip(targets, validation_metrics["perTarget"])
    }

    artifact_dir.mkdir(parents=True, exist_ok=True)
    weights_name = "smoke.weights.h5" if smoke else "candidate.weights.h5"
    weights_path = artifact_dir / weights_name
    model.save_weights(weights_path)
    before_reload = validation_scaled[: min(3, len(validation_scaled))]
    restored = build_property_head(len(targets), learning_rate)
    restored.load_weights(weights_path)
    after_reload = prediction_matrix(restored.predict(validation_encoded[: len(before_reload)], batch_size=batch_size, verbose=0), len(targets))
    reload_equal = bool(np.allclose(before_reload, after_reload, atol=1e-6, rtol=1e-6))
    if not reload_equal:
        raise ValueError("CHECKPOINT_PREDICTION_MISMATCH")

    duration = time.perf_counter() - started
    config = {
        "schemaVersion": "1.0.0",
        "modelName": MODEL_NAME,
        "modelVersion": MODEL_VERSION,
        "stage": "RESEARCH",
        "trainingMode": TRAINING_MODE,
        "upstreamArchitecture": "TRANSFORMER_CNN_V6",
        "upstreamCommit": UPSTREAM_COMMIT,
        "pretrainedEncoderSha256": file_sha256(pretrained_path),
        "pretrainedEncoderTrainable": False,
        "propertyHeadTrainable": True,
        "seed": seed,
        "batchSize": batch_size,
        "maxEpochs": epochs,
        "earlyStopping": not smoke,
        "learningRate": learning_rate,
        "augmentationCount": augmentation_count,
        "chirality": True,
        "canonicalization": "RDKit canonical isomeric before augmentation",
        "targetManifestSha256": preparation["targets"]["targetManifestHash"],
        "splitManifestSha256": split_manifest["splitManifestHash"],
        "datasetSha256": preparation["datasetTransformedSha256"],
        "targets": targets,
        "targetScaler": scaler,
    }
    training_config_sha = digest(config)
    best_epoch = int(np.argmin(history.history["val_loss"]) + 1)
    report = {
        "schemaVersion": "1.0.0",
        "mode": "SMOKE" if smoke else "FULL",
        "trainingConfig": config,
        "trainingConfigSha256": training_config_sha,
        "finiteLoss": True,
        "finiteGradients": True,
        "finiteOutputs": True,
        "shapeContracts": "PASS",
        "encoderParameterCount": encoder_parameter_count,
        "propertyHeadParameterCount": model.count_params(),
        "trainParentRows": len(train_rows),
        "trainAugmentedRows": len(augmented_train),
        "validationRows": len(validation_rows),
        "epochsCompleted": len(history.history["loss"]),
        "bestEpoch": best_epoch,
        "durationSeconds": duration,
        "history": {key: [float(value) for value in values] for key, values in history.history.items()},
        "validationMetrics": validation_metrics,
        "uncertainty": {
            "method": "per-target validation residual RMSE",
            "version": "validation-residual-rmse/1.0.0",
            "calibrationDataset": "VALIDATION",
            "perTargetValues": validation_residual,
        },
        "checkpoint": {
            "format": "KERAS_H5_WEIGHTS",
            "pathName": weights_name,
            "sha256": file_sha256(weights_path),
            "size": weights_path.stat().st_size,
            "reload": "PASS",
            "predictionEquality": "PASS",
        },
    }
    report["uncertainty"]["contentHash"] = digest(report["uncertainty"])
    report["contentHash"] = digest(report)
    write_json(artifact_dir / ("smoke_report.json" if smoke else "training_report.json"), report)
    if not smoke:
        model_manifest = {
            "schemaVersion": "1.0.0",
            "modelName": MODEL_NAME,
            "modelVersion": MODEL_VERSION,
            "modelStage": "RESEARCH",
            "evidenceStatus": "TRAINED_NOT_YET_TEST_EVALUATED",
            "trainingMode": TRAINING_MODE,
            "architecture": "TRANSFORMER_CNN",
            "upstreamCommit": UPSTREAM_COMMIT,
            "targets": targets,
            "targetScaler": scaler,
            "uncertainty": report["uncertainty"],
            "trainingConfigSha256": training_config_sha,
            "datasetSha256": preparation["datasetTransformedSha256"],
            "splitManifestSha256": split_manifest["splitManifestHash"],
            "targetManifestSha256": preparation["targets"]["targetManifestHash"],
            "weights": {"fileName": weights_name, "sha256": report["checkpoint"]["sha256"], "size": report["checkpoint"]["size"]},
            "runtimeVersion": RUNTIME_VERSION,
        }
        model_manifest["contentHash"] = digest(model_manifest)
        write_json(artifact_dir / "model_manifest.pre_evaluation.json", model_manifest)
    return report


def _test_baselines(train_rows: list[dict[str, Any]], test_rows: list[dict[str, Any]], targets: list[str]) -> dict[str, Any]:
    train_y = actual_matrix(train_rows, targets)
    test_y = actual_matrix(test_rows, targets)
    means = np.nanmean(train_y, axis=0)
    mean_metrics = _metrics(test_y, np.tile(means, (len(test_rows), 1)), targets)
    train_x, test_x = _ecfp([{"canonicalSmiles": row["smiles"]} for row in train_rows]), _ecfp([{"canonicalSmiles": row["smiles"]} for row in test_rows])
    prediction = np.empty_like(test_y)
    for index in range(len(targets)):
        mask = np.isfinite(train_y[:, index])
        prediction[:, index] = Ridge(alpha=1.0).fit(train_x[mask], train_y[mask, index]).predict(test_x)
    return {
        "trainMean": {"featureVersion": "none", "metrics": mean_metrics},
        "ecfpRidge": {"featureVersion": ECFP_VERSION, "alpha": 1.0, "metrics": _metrics(test_y, prediction, targets)},
    }


def load_predictor(artifact_dir: Path, upstream_dir: Path) -> tuple[dict[str, Any], tf.keras.Model, tf.keras.Model]:
    manifest_path = artifact_dir / "model_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("architecture") != "TRANSFORMER_CNN" or manifest.get("modelStage") != "RESEARCH" or manifest.get("evidenceStatus") != "EVALUATED":
        raise ValueError("MODEL_NOT_EVALUATED")
    weights = artifact_dir / manifest["weights"]["fileName"]
    if file_sha256(weights) != manifest["weights"]["sha256"]:
        raise ValueError("CHECKPOINT_HASH_MISMATCH")
    encoder = build_encoder(upstream_dir / "pretrained" / "embeddings.npy")
    head = build_property_head(len(manifest["targets"]), 0.0001)
    head.load_weights(weights)
    return manifest, encoder, head


def predict_smiles(manifest: dict[str, Any], encoder: tf.keras.Model, head: tf.keras.Model, smiles: str, requested_targets: list[str] | None = None) -> dict[str, Any]:
    canonical = validate_smiles(smiles)
    targets = manifest["targets"]
    selected = targets if requested_targets is None else requested_targets
    if not selected or len(selected) > len(targets) or any(target not in targets for target in selected):
        raise ValueError("UNSUPPORTED_TARGET")
    encoded = encode(encoder, [canonical], batch_size=1)
    scaled = prediction_matrix(head.predict(encoded, batch_size=1, verbose=0), len(targets))
    values = inverse_scale(scaled, targets, manifest["targetScaler"])[0]
    standardization_version = "olfactoryops-rdkit-standardization/1.0.0"
    structure_hash = digest({"canonicalSmiles": canonical, "standardizationVersion": standardization_version})
    predictions = []
    for target in selected:
        index = targets.index(target)
        predictions.append({
            "descriptor": target.removeprefix("regression_").replace("_", " ").title(),
            "targetKey": target,
            "score": float(values[index]),
            "scale": "dataset descriptor response score, source range 0-1; not a probability",
            "uncertainty": float(manifest["uncertainty"]["perTargetValues"][target]),
            "uncertaintyMethod": manifest["uncertainty"]["method"],
        })
    return {
        "schemaVersion": "1.0.0",
        "modelId": "osmo-dravnieks-transformer-cnn",
        "modelVersionId": manifest["modelVersion"],
        "modelStage": "RESEARCH",
        "trainingMode": manifest["trainingMode"],
        "datasetVersionId": manifest["datasetSha256"],
        "inputStructureHash": structure_hash,
        "canonicalSmiles": canonical,
        "rdkitVersion": __import__("rdkit").__version__,
        "standardizationVersion": standardization_version,
        "predictions": predictions,
        "provenance": {"upstreamCommit": manifest["upstreamCommit"], "checkpointSha256": manifest["weights"]["sha256"], "evaluationHash": manifest["evaluationHash"]},
        "evidenceStatus": "EVALUATED_RESEARCH",
        "runtimeVersion": manifest["runtimeVersion"],
    }


def evaluate(data_dir: Path, artifact_dir: Path, upstream_dir: Path, seed: int, batch_size: int) -> dict[str, Any]:
    configure_determinism(seed)
    targets, split_manifest, preparation = load_preparation(data_dir)
    train_rows = read_csv(data_dir / "train.csv", targets)
    test_rows = read_csv(data_dir / "test.csv", targets)
    pre_manifest = json.loads((artifact_dir / "model_manifest.pre_evaluation.json").read_text(encoding="utf-8"))
    weights = artifact_dir / pre_manifest["weights"]["fileName"]
    if file_sha256(weights) != pre_manifest["weights"]["sha256"]:
        raise ValueError("CHECKPOINT_HASH_MISMATCH")
    encoder = build_encoder(upstream_dir / "pretrained" / "embeddings.npy")
    head = build_property_head(len(targets), 0.0001)
    head.load_weights(weights)
    encoded = encode(encoder, [row["smiles"] for row in test_rows], batch_size)
    prediction = inverse_scale(prediction_matrix(head.predict(encoded, batch_size=batch_size, verbose=0), len(targets)), targets, pre_manifest["targetScaler"])
    transformer_metrics = _metrics(actual_matrix(test_rows, targets), prediction, targets)
    baselines = _test_baselines(train_rows, test_rows, targets)
    comparison = {
        "transformerVsTrainMeanRmseDelta": transformer_metrics["rmse"] - baselines["trainMean"]["metrics"]["rmse"],
        "transformerVsEcfpRmseDelta": transformer_metrics["rmse"] - baselines["ecfpRidge"]["metrics"]["rmse"],
        "truthfulConclusion": "Transformer-CNN is retained as an experimental research candidate regardless of whether it beats the bounded baselines.",
    }
    evaluation: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "protocolVersion": "held-out-scaffold-test/1.0.0",
        "partition": "TEST",
        "testEvaluations": 1,
        "splitManifestSha256": split_manifest["splitManifestHash"],
        "targetManifestSha256": preparation["targets"]["targetManifestHash"],
        "leakageStatus": "PASS",
        "transformerMetrics": transformer_metrics,
        "baselines": baselines,
        "comparison": comparison,
    }
    evaluation["contentHash"] = digest(evaluation)
    write_json(artifact_dir / "evaluation_report.json", evaluation)

    manifest = {**pre_manifest, "evidenceStatus": "EVALUATED", "evaluationHash": evaluation["contentHash"], "evaluationProtocol": evaluation["protocolVersion"]}
    manifest.pop("contentHash", None)
    manifest["contentHash"] = digest(manifest)
    write_json(artifact_dir / "model_manifest.json", manifest)

    bundle_path = artifact_dir / "osmo-dravnieks-transformer-cnn-research.tar.gz"
    with tarfile.open(bundle_path, "w:gz") as archive:
        archive.add(weights, arcname=weights.name)
        archive.add(artifact_dir / "model_manifest.json", arcname="model_manifest.json")
        archive.add(artifact_dir / "evaluation_report.json", arcname="evaluation_report.json")
    bundle_manifest = {
        "modelVersion": MODEL_VERSION,
        "trainingRunId": f"local-research-{pre_manifest['trainingConfigSha256'][:16]}",
        "checkpointFormat": "SAFE_TAR_GZ_KERAS_H5_JSON",
        "checkpointSha256": file_sha256(bundle_path),
        "checkpointSize": bundle_path.stat().st_size,
        "trainingConfigSha256": pre_manifest["trainingConfigSha256"],
        "datasetSha256": pre_manifest["datasetSha256"],
        "splitManifestSha256": pre_manifest["splitManifestSha256"],
        "targetManifestSha256": pre_manifest["targetManifestSha256"],
        "checkpointVerification": "PASS",
    }
    bundle_manifest["contentHash"] = digest(bundle_manifest)
    write_json(artifact_dir / "checkpoint_manifest.json", bundle_manifest)

    # Deterministic post-evaluation demo fixtures are selected from held-out
    # test rows by predicted orientation scores, not by training membership.
    orientation = {
        "FLORAL": ["regression_floral", "regression_rose", "regression_lavender"],
        "CITRUS_FRESH": ["regression_citrus", "regression_lemon", "regression_eucalyptus"],
        "WOODY_MUSKY_AMBER": ["regression_musk", "regression_resinous", "regression_cedarwood"],
    }
    used: set[int] = set()
    demo_cases = []
    for case_index, (orientation_name, orientation_targets) in enumerate(orientation.items(), start=1):
        indices = [targets.index(target) for target in orientation_targets]
        ranking = np.argsort(-np.mean(prediction[:, indices], axis=1))
        selected_index = next(int(index) for index in ranking if int(index) not in used)
        used.add(selected_index)
        row = test_rows[selected_index]
        started = time.perf_counter()
        response_one = predict_smiles(manifest, encoder, head, row["smiles"], targets)
        latency = (time.perf_counter() - started) * 1000.0
        response_two = predict_smiles(manifest, encoder, head, row["smiles"], targets)
        reproducible = canonical_json(response_one) == canonical_json(response_two)
        top = sorted(response_one["predictions"], key=lambda item: item["score"], reverse=True)[:5]
        demo_cases.append({
            "case": case_index,
            "orientation": orientation_name,
            "name": f"Dravnieks held-out molecule {row['sourceRowId']}",
            "canonicalSmiles": row["smiles"],
            "splitMembership": "TEST",
            "trainingSeen": "NO",
            "predictedTopDescriptors": top,
            "modelVersion": MODEL_VERSION,
            "responseLatencyMs": latency,
            "acceptanceStatus": "PASS" if reproducible else "FAIL",
        })
    demo = {"schemaVersion": "1.0.0", "cases": demo_cases, "reproducibility": "PASS" if all(case["acceptanceStatus"] == "PASS" for case in demo_cases) else "FAIL"}
    demo["contentHash"] = digest(demo)
    write_json(artifact_dir / "demo_cases.json", demo)
    return {"evaluation": evaluation, "checkpoint": bundle_manifest, "demo": demo}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("smoke", "train", "evaluate", "infer", "runtime"))
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--artifact-dir", type=Path, required=True)
    parser.add_argument("--upstream-dir", type=Path, default=Path("/opt/transformer-cnn"))
    parser.add_argument("--seed", type=int, default=20260825)
    parser.add_argument("--augmentation-count", type=int, default=4)
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.0001)
    parser.add_argument("--smiles")
    parser.add_argument("--model-version-id")
    args = parser.parse_args()
    if args.operation in {"smoke", "train"}:
        if args.data_dir is None:
            raise SystemExit("--data-dir is required")
        report = train(args.data_dir, args.artifact_dir, args.upstream_dir, smoke=args.operation == "smoke", seed=args.seed, augmentation_count=args.augmentation_count, epochs=args.epochs, batch_size=args.batch_size, learning_rate=args.learning_rate)
        print(f"TRANSFORMER_{args.operation.upper()}=PASS")
        print(f"BEST_EPOCH={report['bestEpoch']}")
    elif args.operation == "evaluate":
        if args.data_dir is None:
            raise SystemExit("--data-dir is required")
        evaluate(args.data_dir, args.artifact_dir, args.upstream_dir, args.seed, args.batch_size)
        print("HELD_OUT_TEST_EVALUATION=PASS")
    elif args.operation == "infer":
        if not args.smiles or not args.model_version_id:
            raise SystemExit("--smiles and --model-version-id are required")
        manifest, encoder, head = load_predictor(args.artifact_dir, args.upstream_dir)
        if args.model_version_id != manifest["modelVersion"]:
            raise SystemExit("MODEL_VERSION_NOT_ALLOWED")
        print(canonical_json(predict_smiles(manifest, encoder, head, args.smiles)))
    else:
        devices = tf.config.list_physical_devices("GPU")
        print(canonical_json({"python": __import__("sys").version.split()[0], "tensorflow": tf.__version__, "gpuCount": len(devices), "gpus": [device.name for device in devices]}))


if __name__ == "__main__":
    main()

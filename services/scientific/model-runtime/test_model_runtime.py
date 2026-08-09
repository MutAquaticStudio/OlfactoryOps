"""Pinned upstream compatibility smoke test; no business prediction is emitted."""

import csv
import os
import sys
import tempfile
import numpy as np
import tensorflow as tf
import keras_core as keras
from rdkit import Chem
from olfactory_pipeline import run_pipeline

from kgcnn.literature_core.GCN._model import make_model

sys.path.insert(0, "/opt/transformer-cnn/transformer_cnn")
from augment_smiles import augment_smiles
from layers import PositionLayer, SelfLayer


def build_kgcnn_model():
    return make_model(inputs=[
        {"shape": (None, 1), "name": "node_attributes", "dtype": "float32"},
        {"shape": (None, 1), "name": "edge_weights", "dtype": "float32"},
        {"shape": (None, 2), "name": "edge_indices", "dtype": "int64"},
        {"shape": (), "name": "total_nodes", "dtype": "int64"},
        {"shape": (), "name": "total_edges", "dtype": "int64"},
    ], depth=1, verbose=0, gcn_args={"units": 16, "use_bias": True, "activation": "relu", "pooling_method": "scatter_sum"})


def test_kgcnn_checkpoint_load_inference_and_metric():
    inputs = [
        np.array([[[6.0], [8.0]]], dtype=np.float32),
        np.array([[[1.0], [1.0]]], dtype=np.float32),
        np.array([[[0, 1], [1, 0]]], dtype=np.int64),
        np.array([2], dtype=np.int64),
        np.array([2], dtype=np.int64),
    ]
    model = build_kgcnn_model()
    # KGCNN is pinned to Keras Core in this image, so its optimizer namespace
    # must match the model namespace rather than TensorFlow's bundled Keras.
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=0.001), loss="mse")
    # This executes a real bounded optimization step rather than only checking
    # that the upstream model can be imported.
    loss = model.train_on_batch(inputs, np.array([[0.25]], dtype=np.float32))
    assert np.isfinite(float(loss))
    output = model(inputs, training=False).numpy()
    assert output.shape == (1, 1), output.shape
    assert np.isfinite(output).all()
    with tempfile.TemporaryDirectory() as directory:
        checkpoint_path = f"{directory}/kgcnn.weights.h5"
        model.save_weights(checkpoint_path)
        restored = build_kgcnn_model()
        restored.load_weights(checkpoint_path)
        restored_output = restored(inputs, training=False).numpy()
    assert np.allclose(output, restored_output, atol=1e-6)
    metric = tf.keras.metrics.MeanSquaredError()
    metric.update_state(np.zeros_like(restored_output), restored_output)
    assert np.isfinite(float(metric.result().numpy()))


def test_transformer_cnn_preprocessing_training_and_checkpoint():
    variants = augment_smiles("CCO", 3, isomeric=True)
    assert len(variants) == 3
    assert variants[0] == "CCO"
    input_tensor = tf.keras.Input(shape=(8,), dtype="float32")
    positioned = PositionLayer(8)(input_tensor)
    mask = tf.keras.layers.Lambda(lambda value: tf.ones((tf.shape(value)[0], tf.shape(value)[1], tf.shape(value)[1]), dtype=tf.float32))(positioned)
    attended = SelfLayer(8, 8)([positioned, positioned, positioned, mask])
    convolved = tf.keras.layers.Conv1D(8, 2, padding="same", activation="relu")(attended)
    output_tensor = tf.keras.layers.Dense(1)(tf.keras.layers.GlobalAveragePooling1D()(convolved))
    model = tf.keras.Model(input_tensor, output_tensor)
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.00001, clipnorm=0.5), loss="mse")
    # Keep the compact smoke batch non-zero: the upstream attention layer has
    # no epsilon in its mask normalization and zero-padded token vectors can
    # produce an all-zero denominator before a caller supplies a real mask.
    tokens = np.array([[0.25, 0.25, 0.5, 0.1, 0.1, 0.1, 0.1, 0.1], [0.25, 0.25, 0.45, 0.1, 0.1, 0.1, 0.1, 0.1]], dtype=np.float32)
    initial_output = model(tokens, training=False).numpy()
    assert np.isfinite(initial_output).all()
    loss = model.train_on_batch(tokens, np.array([[0.2], [0.3]], dtype=np.float32))
    assert np.isfinite(float(loss))
    output = model(tokens, training=False).numpy()
    assert output.shape == (2, 1), output.shape
    assert np.isfinite(output).all()
    with tempfile.TemporaryDirectory() as directory:
        checkpoint_path = f"{directory}/transformer-cnn.weights.h5"
        model.save_weights(checkpoint_path)
        restored = tf.keras.models.clone_model(model)
        restored.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001), loss="mse")
        restored.load_weights(checkpoint_path)
        restored_output = restored(tokens, training=False).numpy()
    assert np.allclose(output, restored_output, atol=1e-6)


def test_public_fixture_is_bounded_and_structurally_groupable():
    fixture = "/opt/fixtures/dravnieks_benchmark.csv"
    with open(fixture, newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 24
    canonical = []
    for row in rows:
        molecule = Chem.MolFromSmiles(row["smiles"])
        assert molecule is not None
        canonical.append(Chem.MolToSmiles(molecule, canonical=True))
        for key in ("floral", "citrus", "musk"):
            assert np.isfinite(float(row[key]))
    assert len(canonical) == len(set(canonical)), "fixture duplicates must be grouped before a split"
    report = run_pipeline(fixture)
    assert report["leakageStatus"] == "PASS"
    assert report["serving"] == "RESEARCH_ONLY"


if __name__ == "__main__":
    test_kgcnn_checkpoint_load_inference_and_metric()
    test_transformer_cnn_preprocessing_training_and_checkpoint()
    test_public_fixture_is_bounded_and_structurally_groupable()
    print("MODEL_RUNTIME_COMPATIBILITY=PASS")

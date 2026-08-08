"""Pinned upstream compatibility smoke test; no business prediction is emitted."""

import sys
import tempfile
import numpy as np
import tensorflow as tf

from kgcnn.literature_core.GCN._model import make_model

sys.path.insert(0, "/opt/transformer-cnn/transformer_cnn")
from augment_smiles import augment_smiles
from layers import PositionLayer


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


def test_transformer_cnn_preprocessing_and_layer_forward():
    variants = augment_smiles("CCO", 3, isomeric=True)
    assert len(variants) == 3
    assert variants[0] == "CCO"
    input_tensor = tf.keras.Input(shape=(4,), dtype="float32")
    output_tensor = PositionLayer(4)(input_tensor)
    model = tf.keras.Model(input_tensor, output_tensor)
    output = model(np.ones((1, 4), dtype=np.float32), training=False).numpy()
    assert output.shape == (1, 4, 4), output.shape
    assert np.isfinite(output).all()


if __name__ == "__main__":
    test_kgcnn_checkpoint_load_inference_and_metric()
    test_transformer_cnn_preprocessing_and_layer_forward()
    print("MODEL_RUNTIME_COMPATIBILITY=PASS")

"""OlfactoryOps adapter for the exact pinned Transformer-CNN v6 architecture.

The upstream project is config/global-state oriented and serializes target
metadata with pickle. This adapter keeps its pretrained Transformer encoder,
custom upstream layers, and CNN/highway head while using bounded JSON metadata
and Keras weights for safe research serving.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
from pathlib import Path
from typing import Any

import numpy as np
import tensorflow as tf
from rdkit import Chem, rdBase
from tensorflow.keras import layers

from augment_smiles import augment_smiles
from layers import LayerNormalization, MaskLayerLeft, PositionLayer, SelfLayer


UPSTREAM_COMMIT = "4db725b5e549af7697215d8cc7a6e8a2a952dca5"
TRAINING_MODE = "FINE_TUNE_FROZEN_PRETRAINED_ENCODER"
CHARS = " ^#%()+-./0123456789=@ABCDEFGHIKLMNOPRSTVXYZ[\\]abcdefgilmnoprstuy$"
CHAR_TO_INDEX = {character: index for index, character in enumerate(CHARS)}
VOCAB_SIZE = len(CHARS)
EMBEDDING_SIZE = 64
KEY_SIZE = EMBEDDING_SIZE
N_BLOCKS = 3
N_SELF = 10
N_HIDDEN = 512
N_HIDDEN_CNN = 512
CONV_OFFSET = 20
KERNEL_SIZES = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20)
NUM_FILTERS = (100, 200, 200, 200, 200, 100, 100, 100, 100, 100, 160, 160)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def configure_determinism(seed: int) -> None:
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
    tf.keras.utils.set_random_seed(seed)
    rdBase.SeedRandomNumberGenerator(seed)
    try:
        tf.config.experimental.enable_op_determinism()
    except (AttributeError, RuntimeError):
        pass
    for device in tf.config.list_physical_devices("GPU"):
        try:
            tf.config.experimental.set_memory_growth(device, True)
        except RuntimeError:
            pass


def validate_smiles(smiles: str) -> str:
    if not isinstance(smiles, str) or not smiles or len(smiles) > 4096:
        raise ValueError("INVALID_SMILES")
    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None:
        raise ValueError("INVALID_SMILES")
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    unsupported = set(canonical) - set(CHARS)
    if unsupported:
        raise ValueError("UNSUPPORTED_SMILES_VOCABULARY")
    return canonical


def augment_partition(rows: list[dict[str, Any]], count: int, seed: int, isomeric: bool = True) -> list[dict[str, Any]]:
    if count < 1 or count > 10:
        raise ValueError("AUGMENTATION_COUNT_OUT_OF_RANGE")
    rdBase.SeedRandomNumberGenerator(seed)
    augmented = []
    for row in rows:
        canonical = validate_smiles(row["smiles"])
        variants = augment_smiles(canonical, count, isomeric=isomeric)
        if any(value.startswith("ERROR ") for value in variants):
            raise ValueError("SMILES_AUGMENTATION_FAILED")
        for index, variant in enumerate(variants):
            augmented.append({**row, "smiles": variant, "parentCanonicalSmiles": canonical, "augmentationIndex": index})
    return augmented


def tokenize(smiles_values: list[str]) -> tuple[np.ndarray, np.ndarray]:
    canonical_values = [validate_smiles(value) for value in smiles_values]
    width = max(max(len(value) for value in canonical_values) + CONV_OFFSET, max(KERNEL_SIZES))
    tokens = np.zeros((len(canonical_values), width), dtype=np.int32)
    mask = np.zeros((len(canonical_values), width), dtype=np.float32)
    for row_index, value in enumerate(canonical_values):
        for column_index, character in enumerate(value):
            tokens[row_index, column_index] = CHAR_TO_INDEX[character]
        mask[row_index, : len(value)] = 1.0
    return tokens, mask


def build_encoder(pretrained_path: Path) -> tf.keras.Model:
    token_input = layers.Input(shape=(None,), dtype="int32", name="smiles_tokens")
    mask_input = layers.Input(shape=(None,), dtype="float32", name="smiles_mask")
    positional = PositionLayer(EMBEDDING_SIZE)(mask_input)
    attention_mask = MaskLayerLeft()(mask_input)
    vocabulary = layers.Embedding(input_dim=VOCAB_SIZE, output_dim=EMBEDDING_SIZE, trainable=False, name="upstream_vocabulary")
    embedded = layers.Add()([vocabulary(token_input), positional])
    for block in range(N_BLOCKS):
        attention = [SelfLayer(EMBEDDING_SIZE, KEY_SIZE, trainable=False)([embedded, embedded, embedded, attention_mask]) for _ in range(N_SELF)]
        concatenated = layers.Concatenate(name=f"encoder_attention_concat_{block}")(attention)
        projected = layers.TimeDistributed(layers.Dense(EMBEDDING_SIZE, trainable=False), trainable=False, name=f"encoder_attention_projection_{block}")(concatenated)
        attended = LayerNormalization(trainable=False, name=f"encoder_attention_norm_{block}")(layers.Add()([projected, embedded]))
        feed_forward = layers.Conv1D(N_HIDDEN, 1, activation="relu", trainable=False, name=f"encoder_ff_expand_{block}")(attended)
        feed_forward = layers.Conv1D(EMBEDDING_SIZE, 1, trainable=False, name=f"encoder_ff_contract_{block}")(feed_forward)
        embedded = LayerNormalization(trainable=False, name=f"encoder_ff_norm_{block}")(layers.Add()([attended, feed_forward]))
    encoder = tf.keras.Model([token_input, mask_input], embedded, name="pinned_transformer_cnn_encoder")
    weights = np.load(pretrained_path, allow_pickle=True)
    encoder.set_weights(list(weights))
    encoder.trainable = False
    return encoder


def build_property_head(target_count: int, learning_rate: float) -> tf.keras.Model:
    if target_count < 1 or target_count > 20:
        raise ValueError("TARGET_COUNT_OUT_OF_RANGE")
    encoded_input = layers.Input(shape=(None, EMBEDDING_SIZE), dtype="float32", name="pretrained_encoder_output")
    pooled = []
    for kernel_size, filters in zip(KERNEL_SIZES, NUM_FILTERS):
        convolved = layers.Conv1D(filters, kernel_size=kernel_size, padding="valid", kernel_initializer="normal", activation="relu", name=f"text_cnn_k{kernel_size}")(encoded_input)
        pooled.append(layers.Lambda(lambda value: tf.reduce_max(value, axis=1), name=f"text_cnn_pool_k{kernel_size}")(convolved))
    merged = layers.Concatenate(axis=1, name="text_cnn_concat")(pooled)
    hidden = layers.Dropout(rate=0.25, name="text_cnn_dropout")(merged)
    hidden = layers.Dense(N_HIDDEN_CNN, activation="relu", name="text_cnn_dense")(hidden)
    transform_gate = layers.Dense(N_HIDDEN_CNN, activation="sigmoid", bias_initializer=tf.keras.initializers.Constant(-1), name="highway_transform_gate")(hidden)
    carry_gate = layers.Lambda(lambda value: 1.0 - value, name="highway_carry_gate")(transform_gate)
    transformed = layers.Dense(N_HIDDEN_CNN, activation="relu", name="highway_transformed")(hidden)
    highway = layers.Add(name="highway_output")([layers.Multiply()([transform_gate, transformed]), layers.Multiply()([carry_gate, hidden])])
    outputs = [layers.Dense(1, activation="linear", name=f"regression_{index:02d}")(highway) for index in range(target_count)]
    model = tf.keras.Model(encoded_input, outputs, name="pinned_transformer_cnn_v6_property_head")
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate, clipnorm=1.0), loss=["mse"] * target_count)
    return model


def verify_property_head_gradients(
    model: tf.keras.Model,
    encoded_batch: np.ndarray | tf.Tensor,
    target_values: list[np.ndarray | tf.Tensor],
) -> dict[str, Any]:
    encoded = tf.convert_to_tensor(encoded_batch, dtype=tf.float32)
    if encoded.shape.rank != 3 or encoded.shape[-1] != EMBEDDING_SIZE:
        raise ValueError("GRADIENT_CHECK_INPUT_SHAPE_INVALID")
    if len(target_values) != len(model.outputs):
        raise ValueError("GRADIENT_CHECK_TARGET_COUNT_INVALID")
    targets = [tf.convert_to_tensor(value, dtype=tf.float32) for value in target_values]
    with tf.GradientTape() as tape:
        raw_predictions = model(encoded, training=True)
        predictions = raw_predictions if isinstance(raw_predictions, list) else [raw_predictions]
        if len(predictions) != len(targets):
            raise ValueError("GRADIENT_CHECK_OUTPUT_COUNT_INVALID")
        losses = [tf.reduce_mean(tf.math.squared_difference(target, prediction)) for target, prediction in zip(targets, predictions)]
        total_loss = tf.add_n(losses)
    variables = model.trainable_variables
    gradients = tape.gradient(total_loss, variables)
    if not variables or any(gradient is None for gradient in gradients):
        raise ValueError("MISSING_PROPERTY_HEAD_GRADIENT")
    if not bool(tf.math.is_finite(total_loss).numpy()):
        raise ValueError("NONFINITE_PROPERTY_HEAD_LOSS")
    if not all(bool(tf.reduce_all(tf.math.is_finite(gradient)).numpy()) for gradient in gradients if gradient is not None):
        raise ValueError("NONFINITE_PROPERTY_HEAD_GRADIENT")
    return {
        "status": "PASS",
        "finiteLoss": True,
        "finiteGradients": True,
        "trainableVariableCount": len(variables),
    }


def encode(encoder: tf.keras.Model, smiles_values: list[str], batch_size: int) -> np.ndarray:
    tokens, mask = tokenize(smiles_values)
    result = encoder.predict([tokens, mask], batch_size=batch_size, verbose=0)
    if not np.isfinite(result).all():
        raise ValueError("NONFINITE_ENCODER_OUTPUT")
    return result


def prediction_matrix(prediction: Any, target_count: int) -> np.ndarray:
    values = prediction if isinstance(prediction, list) else [prediction]
    if len(values) != target_count:
        raise ValueError("MODEL_OUTPUT_SHAPE_INVALID")
    matrix = np.column_stack([np.asarray(value).reshape(-1) for value in values])
    if not np.isfinite(matrix).all():
        raise ValueError("NONFINITE_MODEL_OUTPUT")
    return matrix

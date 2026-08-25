# Phase 4 Model Runtime Compatibility

This image is an isolated compatibility and bounded research prediction service.
It pins `osmoai/kgcnn-keras-unlocked` and `osmoai/transformer-CNN`
at the commits recorded in `../runtime/model-component-pins.json`.

KGCNN is patched only in this isolated image for Keras Core 0.1.7 API moves
(`any_symbolic_tensors`, `KerasTensor`, `Operation`, `Repeat`, and
`is_tensor`). The checked compatibility adapter is applied at build time,
asserts the exact expected source shape before changing it, and is tracked as
`KERAS_CORE_0_1_7_SYMBOLIC_COMPAT_PATCH`, and is not loaded by any application
runtime.

```powershell
docker build --file services/scientific/model-runtime/Dockerfile --tag olfactoryops-model-runtime-phase4 services/scientific/model-runtime
docker run --rm olfactoryops-model-runtime-phase4
```

The compatibility test builds a tiny KGCNN GCN, executes one optimization step,
and exercises the pinned Transformer-CNN layers. It also loads the bundled,
evaluated `osmo-dravnieks-transformer-cnn/1.0.0` checkpoint, verifies its SHA-256,
and repeats all three held-out demo predictions.

`/v1/predictions` is authenticated by `SCIENTIFIC_SERVICE_SHARED_SECRET`, accepts
only the allow-listed semantic model version, one bounded SMILES value, and an
optional subset of at most 20 registered targets. It cannot accept a checkpoint
path, URL, module, command, or arbitrary architecture. The API layer separately
resolves the tenant-owned registry model ID and checks model/checkpoint/structure
identity before persisting evidence. `/v1/jobs` remains truthfully
`NOT_CONFIGURED` for generic dynamic model loading.

Transformer-CNN remains `REVIEW_REQUIRED` until its license evidence has
independent legal review. The bundled candidate remains `RESEARCH`; this image is
not a production deployment declaration.

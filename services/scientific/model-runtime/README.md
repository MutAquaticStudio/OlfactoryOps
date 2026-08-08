# Phase 4 Model Runtime Compatibility

This image is an isolated compatibility test, not an OlfactoryOps prediction
service. It pins `osmoai/kgcnn-keras-unlocked` and `osmoai/transformer-CNN`
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

The test builds a tiny KGCNN GCN and runs one forward pass. It also exercises
Transformer-CNN SMILES augmentation and its position layer. It does not load a
tenant checkpoint, train on a dataset, expose an HTTP endpoint, or emit a
scientific conclusion. Transformer-CNN remains `REVIEW_REQUIRED` until its
license evidence has independent legal review.

# Phase 4 Model Cards

## Required card fields

Every registered model version supplies a typed model card with:

- purpose and intended use;
- dataset and license reference;
- feature contract and architecture reference;
- metrics and evaluation limitations;
- known failure modes;
- prohibited interpretations.

The server stores the card as versioned evidence. It does not treat any card
statement as a scientific conclusion.

## KGCNN compatibility reference

| Field | Value |
|---|---|
| Component | `osmoai/kgcnn-keras-unlocked` |
| Source | commit `24d8b61214405f855d8a893469dfc59c0ea6c075` |
| License | MIT, source evidence verified |
| Adapter | `kgcnn-adapter/1.0.0` |
| Runtime | TensorFlow 2.15.1 and Keras Core 0.1.7 |
| Patch | `KERAS_CORE_0_1_7_SYMBOLIC_COMPAT_PATCH` in the test image only |
| Evidence | Model construction, checkpoint round-trip, synthetic inference, finite MSE |
| Intended use | Compatibility evidence for later evaluated graph-model candidates |
| Prohibited interpretation | Not an odor, safety, IFRA, cost, inventory, or formula approval result |

The compatibility adapter only maps moved Keras Core APIs for symbolic tensor
detection and repeat/operation support. It is not copied into application
code. Its exact source is
`services/scientific/model-runtime/apply_kgcnn_compat.py`; it refuses an
unexpected upstream source shape and its status is part of the manifest
checksum.

## Transformer-CNN compatibility reference

| Field | Value |
|---|---|
| Component | `osmoai/transformer-CNN` |
| Source | commit `4db725b5e549af7697215d8cc7a6e8a2a952dca5` |
| License | MIT declared in project metadata; independent evidence review required |
| Adapter | `transformer-cnn-adapter/1.0.0` |
| Evidence | SMILES augmentation and position-layer synthetic forward pass |
| Activation | BLOCKED pending license evidence review |
| Prohibited interpretation | No production serving, model comparison, or chemistry recommendation |

## Publications reference

`osmoai/publications` is recorded at commit
`5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8`: Apache-2.0 for code and CC-BY-4.0
for datasets. No publication dataset is downloaded or imported by Phase 4.
Before a future dataset registration, its exact license, attribution,
transformations, checksum, split strategy, and tenant/legal usage scope must
be recorded and reviewed.

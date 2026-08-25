# Osmo Demo Upstream Component Audit

Captured against repository base `92b59457ea2cded328246f3310108ff5595c57b1` on 2026-08-25.

| Component | Repository | Pin | License | Policy evidence | Role | Trainable today | Current test/runtime | Action today |
|---|---|---|---|---|---|---|---|---|
| RDKIT | `rdkit/rdkit` | `de8add1e32ff6d3c4e4e406f64b703b662dff1d6` | BSD-3-Clause | VERIFIED | normalization, scaffold, ECFP | No | scientific runtime; model image 2023.9.3 | Reuse pinned model-image runtime |
| BCFP | `osmoai/bcfp` | `4753262e2ae6eb231be318c40623c8ab166d8ec5` | BSD-3-Clause | VERIFIED | preferred fingerprint baseline | No | isolated primary scientific runtime | Attempt only after required ECFP baseline |
| MOLFTP | `osmoai/molftp` | `98ffcb67ccfae9a0407f85f20cc76da49c784568` | BSD-3-Clause | VERIFIED | optional target-aware feature | Yes | isolated primary scientific runtime | Defer unless train-only target fitting is already safe |
| OSMORDRED | `osmoai/osmordred` | `07b8d22f570712c6ab3527dde195aad42fef4679` | BSD-3-Clause | VERIFIED | optional molecular evidence | No | isolated RDKit 2023.09.3 runtime | Defer from primary training path |
| KGCNN_KERAS_UNLOCKED | `osmoai/kgcnn-keras-unlocked` | `24d8b61214405f855d8a893469dfc59c0ea6c075` | MIT | VERIFIED | fallback model | Yes | bounded optimization/checkpoint smoke PASS | Do not train unless Transformer-CNN is blocked |
| TRANSFORMER_CNN | `osmoai/transformer-CNN` | `4db725b5e549af7697215d8cc7a6e8a2a952dca5` | MIT | REVIEW_REQUIRED | primary SMILES model | Head only | upstream layer/checkpoint smoke PASS | Run research-only candidate; preserve policy status |
| OSMO_PUBLICATIONS | `osmoai/publications` | `5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8` | Apache-2.0 code; CC BY 4.0 data | VERIFIED | Dravnieks dataset | No | provenance registry | Use exact Git LFS object |

All expected repository pins resolved remotely to the recorded commits. No pin was changed.

## Transformer-CNN semantics

The exact upstream commit contains `license.txt` with the MIT grant. Its SHA-256 is
`ac1ed1d9446f9dc53978ed844c1442d8601d4ee797b4dc8e9d148b2a30e34706`.
This is authoritative source evidence, not an independent legal approval, so the
OlfactoryOps policy state remains `REVIEW_REQUIRED`.

The default upstream property-training path copies a pretrained
`pretrained/embeddings.npy` encoder artifact and loads those weights into a frozen
Transformer encoder. The property-specific Transformer-CNN head is then optimized
on the supervised dataset. The exact training label for this goal is therefore
`FINE_TUNE_FROZEN_PRETRAINED_ENCODER`; it is not training from random initialization,
and it does not claim that the frozen encoder weights themselves are updated.

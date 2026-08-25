# Osmo Dravnieks Transformer-CNN Research Candidate

## Identity

- Model: `osmo-dravnieks-transformer-cnn/1.0.0`
- Stage: `RESEARCH`
- Canonical training mode: `TRANSFER_LEARNING_FROZEN_PRETRAINED_ENCODER`
- Historical artifact identifier: `FINE_TUNE_FROZEN_PRETRAINED_ENCODER`
- Upstream Transformer-CNN: `4db725b5e549af7697215d8cc7a6e8a2a952dca5`
- Checkpoint SHA-256: `a23cb99eaa603678ca15f9a83e814a9a6c8691c692582f4aae5f18c65ae0813d`
- Checkpoint format: Keras H5 weights, 26,862,792 bytes

This is transfer learning with a frozen pretrained molecular Transformer
encoder. The upstream pretrained 3-block, 10-head encoder is loaded from
`pretrained/embeddings.npy` and remains frozen; only the property head and
highway layers are updated on the odor-labelled training partition. The
historical artifact identifier is retained to preserve checkpoint lineage and
does not mean that the Transformer encoder itself was fine-tuned.

The bounded `test_actual_property_head_has_explicit_finite_gradients` runtime
smoke executes the actual supervised head under `GradientTape`, checks its real
MSE loss, and requires every trainable gradient and the loss to be finite.

## Intended Use

This model provides bounded research evidence for a verified tenant material's
molecular identity. It predicts 20 dataset-native Dravnieks descriptor response
scores on the source 0-1 scale. Scores are regression outputs, not probabilities.

The only supported serving path resolves a tenant-owned model version, verified
checkpoint, successful leakage-safe training run, held-out evaluation, and
verified molecular identity before calling the private model container.

## Data And Evaluation

The source is the CC BY 4.0 Dravnieks data in Qian et al. (2023), eLife 12:e82502,
from `osmoai/publications` commit
`5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8`. The resolved Git LFS object is
`d560c47e9fc9fe8e802144be0c219e84594ef99611cfe1f7e4c861f38720edaf`.

- Valid rows: 127; rejected: 0; duplicate/conflicting structures: 0/0
- Split: scaffold-group, seed `20260825`, 72 train / 24 validation / 31 test
- Canonical overlap: 0; scaffold overlap: 0; leakage: `PASS`
- Test MAE/RMSE: 0.0629868994 / 0.0889954978
- Train-mean test MAE/RMSE: 0.0688829480 / 0.0956995759
- ECFP Ridge test MAE/RMSE: 0.0655835644 / 0.0905083833

Test metrics were computed once after the target manifest, split, preprocessing,
architecture, hyperparameters, and checkpoint were frozen. Metrics are macro
unweighted across 20 targets, with `n=31` per target.

## Uncertainty

Each prediction carries the corresponding validation residual RMSE. This is an
estimated residual scale, not a calibrated confidence interval or probability.
The uncertainty artifact hash is
`1a820e010f31ac3c4f158d2b0d2bd079b19109209380cb432e415a3c5f2112b8`.

## Weak Targets And Limitations

The largest held-out RMSE values occur for fragrant, aromatic, sweet, floral,
perfumery, and spicy. The dataset is small, historical, and restricted to the
selected descriptor vocabulary. Predictions outside its molecular or descriptor
domain are not established.

- No safety, toxicology, IFRA, regulatory, supplier, or formula approval.
- No consumer preference guarantee.
- No causal chemistry interpretation.
- No production model promotion.
- Transformer-CNN license source evidence is MIT, while independent policy
  review truthfully remains `REVIEW_REQUIRED`.

## Deferred Components

BCFP baseline, MolFTP target fitting, Osmordred UI evidence, and KGCNN training
are deferred. ECFP and train-mean provide the two bounded baselines required for
today's primary candidate; adding more architectures would not improve the
leakage or serving evidence.

# Research Odor Demo Runbook

1. Run the private model container with `SCIENTIFIC_SERVICE_SHARED_SECRET` set
   and keep it unreachable from public routes.
2. Configure the API's `SCIENTIFIC_MODEL_SERVICE_URL` to that private service and
   bind the same secret by name. Never put it in browser configuration.
3. Register and approve the dataset, register the model/version/training/evaluation,
   and verify the checkpoint through `ModelDatasetService`. The isolated local
   integration evidence is in `MODEL_REGISTRY_EVIDENCE.json`.
4. Ensure the tenant material has a `RESOLVED` molecular identity whose structure
   hash was produced by `olfactoryops-rdkit-standardization/1.0.0`.
5. Open Materials, select the material, and run **Predict research profile**.

The UI describes the training method as **Transfer learning — frozen pretrained
encoder**. This means transfer learning with a frozen pretrained molecular
Transformer encoder: the encoder weights remain unchanged while the supervised
property head is trained. Historical registry artifacts keep
`FINE_TUNE_FROZEN_PRETRAINED_ENCODER` solely as an immutable lineage identifier.

Expected states are `IDLE`, `RUNNING`, `SUCCESS`, `NOT_EVALUATED`,
`NOT_CONFIGURED`, and `ERROR`. Only a successful private runtime response whose
model version, checkpoint hash, stage, and molecular structure hash all match
registry evidence can become `SUCCESS`.

The three deterministic demo fixtures are held-out TEST molecules in
`services/scientific/model-runtime/artifacts/osmo-dravnieks-transformer-cnn/demo_cases.json`.
They are floral-oriented, citrus/fresh-oriented, and woody/musky/amber-oriented;
all have `trainingSeen=NO` and repeated prediction equality `PASS`.

This runbook is local/research only. It does not authorize production deployment.

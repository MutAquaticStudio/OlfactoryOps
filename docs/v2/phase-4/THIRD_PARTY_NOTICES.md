# Phase 4 Third-party Notices

This phase records provenance for selected upstream research components. The
registry is not an endorsement by any upstream project and does not distribute
an upstream dataset or checkpoint.

| Component               | Repository                                       | Immutable commit                           | Declared license                       | Local use in Phase 4                              |
| ----------------------- | ------------------------------------------------ | ------------------------------------------ | -------------------------------------- | ------------------------------------------------- |
| KGCNN Keras Unlocked    | `https://github.com/osmoai/kgcnn-keras-unlocked` | `24d8b61214405f855d8a893469dfc59c0ea6c075` | MIT                                    | Isolated compatibility test only                  |
| Transformer-CNN         | `https://github.com/osmoai/transformer-CNN`      | `4db725b5e549af7697215d8cc7a6e8a2a952dca5` | MIT declared; evidence review required | Isolated preprocessing/layer test only            |
| Osmo Publications       | `https://github.com/osmoai/publications`         | `5aa9d2cd06a9b4dcae8b5fce2ec5e5d0f763fbd8` | Apache-2.0 code; CC-BY-4.0 datasets    | Source/provenance registry only                   |
| The Osmo Scent Taxonomy | `https://github.com/osmoai/taxonomy`             | `fcd538b578e0a3c6261503380de03d0691b47344` | ODbL-1.0                               | Vendored, checksum-pinned v1.2 reference taxonomy |

The authoritative in-repository machine-readable pin manifest is
`services/scientific/runtime/model-component-pins.json`. Database rows are
validated against its stable SHA-256 manifests by `scripts/verify-v2-postgres.mjs`.

The Osmo Scent Taxonomy is copyright 2025 Osmo, Inc. Public use must attribute
"The Osmo Scent Taxonomy" and link to `https://github.com/osmoai/taxonomy`.
Publicly shared derivative taxonomy databases must remain under ODbL 1.0. The
full upstream notice is vendored beside the pinned taxonomy artifact.

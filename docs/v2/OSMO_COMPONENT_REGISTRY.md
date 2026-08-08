# Osmo Component Registry (Phase 0)

The registry below is derived from `docs/v2/manifests/osmo-components.yaml`. Components are used only through OlfactoryOps Scientific API adapters. No vendor code is copied into the domain or UI layers.

| Component | Repository | License | Planned role | Integration mode | Pin status | Adapter | Runtime | Future test |
|---|---|---|---|---|---|---|---|---|
| `osmoai/chem` | `https://github.com/osmoai/chem` | MIT | chemical structure normalization/validation | scientific API adapter | REQUIRES_REVIEW | `OsmoChemAdapter` | Python service | golden structures, invalid input, provenance |
| `osmoai/odordiff` | `https://github.com/osmoai/odordiff` | MIT | odor similarity and descriptor features | scientific API adapter | REQUIRES_REVIEW | `OsmoOdorDiffAdapter` | Python service | deterministic fixture, score bounds, model ref |
| `osmoai/odor-prediction` | `https://github.com/osmoai/odor-prediction` | MIT | prediction adapter boundary | scientific API adapter | REQUIRES_REVIEW | `OsmoOdorPredictionAdapter` | Python service | versioned artifact, uncertainty, no authority |
| `osmoai/odor-molecules` | `https://github.com/osmoai/odor-molecules` | MIT | curated molecule metadata adapter | scientific API adapter | REQUIRES_REVIEW | `OsmoMoleculeAdapter` | Python service | source checksum, license, tenant projection |
| `osmoai/odor-map` | `https://github.com/osmoai/odor-map` | MIT | odor map feature adapter | scientific API adapter | REQUIRES_REVIEW | `OsmoOdorMapAdapter` | Python service | embedding version and citation |
| `osmoai/odor-examples` | `https://github.com/osmoai/odor-examples` | MIT | test/example fixtures only | CI fixture import | UNPINNED | `OsmoExampleFixtureAdapter` | test data | license and fixture isolation |

`osmoai/taxonomy` is explicitly excluded. No ODbL data or taxonomy implementation is included in this phase. Pinning, license confirmation, SBOM, and reproducible adapter tests are mandatory before activation.

# Osmo Component Registry

Phase 3 is the only active scientific integration checkpoint. All components
are accessed through the private Scientific Runtime; React, Workers, and
business-domain services do not import upstream code directly.

| Key | Repository | License | Immutable source | Adapter | Runtime | Patch status | Compatibility state |
|---|---|---|---|---|---|---|---|
| `RDKIT` | `rdkit/rdkit` | BSD-3-Clause | `Release_2026_03_5` / `de8add1e32ff6d3c4e4e406f64b703b662dff1d6` | `structure-adapter/1.0.0` | `rdkit=2026.3.5` | None | PASS locally |
| `RDKIT_PYPI` | `osmoai/rdkit-pypi` | BSD-3-Clause upstream | `7893ac5053c9db20761767d02085a13594778eee` | `wheel-reference/1.0.0` | `rdkit=2026.3.5` | None | PASS locally |
| `BCFP` | `osmoai/bcfp` | BSD-3-Clause | `4753262e2ae6eb231be318c40623c8ab166d8ec5` | `bcfp-adapter/1.0.0` | primary conda-forge RDKit 2026.03 | None | PASS native build and adapter test |
| `MOLFTP` | `osmoai/molftp` | BSD-3-Clause | `98ffcb67ccfae9a0407f85f20cc76da49c784568` | `molftp-adapter/1.0.0` | primary conda-forge RDKit 2026.03 | None | PASS native build and guarded artifact test |
| `OSMORDRED` | `osmoai/osmordred` | BSD-3-Clause | `07b8d22f570712c6ab3527dde195aad42fef4679` | `osmordred-adapter/1.0.0` | isolated RDKit 2023.09.3 | README copy only for upstream packaging | PASS isolated native build and descriptor test |

`osmoai/taxonomy` is explicitly excluded. No ODbL taxonomy data is used.

The runtime record is [`services/scientific/runtime/component-pins.json`](../../services/scientific/runtime/component-pins.json). The PostgreSQL migration persists the same pin data in `v2_scientific_component_pins`; source ref, commit SHA, adapter version, runtime version, patch status, and test identity must be updated together.

No Phase 4+ model, dataset, embedding, odor prediction, similarity index, or
external LLM is activated by this registry.

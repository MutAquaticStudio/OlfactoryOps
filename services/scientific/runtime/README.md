# Phase 3 Scientific Runtime

This is a private Python/C++ service. It only receives bounded molecular structure and feature requests from the V2 API. It never receives browser credentials, organization identifiers, permissions, inventory, formula, supplier, or document data.

## Pinning

`component-pins.json` is the runtime pin record. Every component is identified by repository, license, exact commit, adapter version, runtime version, patch status, and compatibility test. The service does not follow an upstream branch at runtime.
The V2 migration stores the same fields with `manifest_hash` equal to the
SHA-256 of the component's canonical key-sorted JSON record. Migration
verification rejects a database registry that diverges from this source file.

- `RDKIT`: structure parsing, canonicalization, graph and optional InChI/InChIKey.
- `BCFP`: native BCFP artifact only when its pinned adapter is installed. There is no ECFP fallback labelled as BCFP.
- `MOLFTP`: only evaluates when a registered target dataset with aligned labels is supplied by a future internal dataset service. In Phase 3 API requests have no target context, so it returns `NOT_EVALUATED`.
- `OSMORDRED`: native descriptor artifact only when the pinned patched RDKit runtime is installed. Its historical RDKit 2023.09.3 dependency is intentionally isolated from the RDKit 2026 BCFP/MolFTP image until an audited compatible build is available.

## Local structure smoke test

```powershell
python -m venv .qa/scientific-runtime
.qa/scientific-runtime/Scripts/python.exe -m pip install -r services/scientific/runtime/requirements.local.txt
$env:PYTHONPATH = "services/scientific/runtime"
.qa/scientific-runtime/Scripts/python.exe -m unittest discover services/scientific/runtime/tests
```

The local runtime verifies RDKit/ECFP and explicit unavailable-native states. It does not claim BCFP, MolFTP, or Osmordred are installed.

## Native compatibility images

```powershell
docker build --file services/scientific/runtime/Dockerfile --tag olfactoryops-scientific-phase3 services/scientific/runtime
docker run --rm -e SCIENTIFIC_SERVICE_SHARED_SECRET=local-test-secret olfactoryops-scientific-phase3 python -m unittest discover tests

docker build --file services/scientific/runtime/Dockerfile.osmordred --tag olfactoryops-scientific-osmordred-phase3 services/scientific/runtime
docker run --rm -e SCIENTIFIC_SERVICE_SHARED_SECRET=local-test-secret olfactoryops-scientific-osmordred-phase3 python -m unittest discover tests
```

The primary image owns RDKit 2026, BCFP, and MolFTP. The second image owns the
pinned RDKit 2023.09.3 Osmordred build. `CompositeScientificRuntime` only
combines their artifacts when both runtimes report the same structure hash;
otherwise it fails closed. Neither image is deployed in Phase 3.

When a private service deployment is introduced in a later phase, configure
`SCIENTIFIC_SERVICE_URL` for the primary runtime and
`SCIENTIFIC_OSMORDRED_SERVICE_URL` for the descriptor runtime. Both services
must use the same internal shared-secret boundary and remain inaccessible from
the browser.

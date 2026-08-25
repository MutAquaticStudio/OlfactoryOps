# Pilot 50 Import Contract

## Purpose and boundary

`services/scientific/testdata/material-intelligence-pilot50.json` is a deterministic local/test fixture. It is not a production import file and must never be sent to the V2 production migration or governed bulk-import endpoints.

## File contract

- `contractVersion`: exactly `material-intelligence-pilot/1.0.0`;
- `normalizationVersion`: the exact repository structure-normalization contract used by verified pilot records;
- `rdkitVersion`: the RDKit version used by that bounded normalization run;
- `retrievedAt`: one bounded evidence capture timestamp;
- `cases`: exactly 50 unique, ordered cases `M001` through `M050`.

Every case contains product classification, Chemical Entity type, resolution status, and evidence status. Verified single-substance cases additionally require a complete PubChem CID, source canonical/isomeric SMILES, repository-normalized canonical SMILES, InChIKey, structure hash, evidence content hash, and stereochemistry state. The parser recomputes the pinned PubChem evidence hash, rejects partial structure evidence, and rejects structure fields on unresolved/unverified cases.

Components declare role and either an exact percent or unknown concentration. The four named dilution cases require an active plus carrier/solvent component and exact concentrations summing to 100 percent.

## Fail-closed validation

The runner rejects:

- any count other than 50 or any missing/duplicate/out-of-order case ID;
- a verified identity without complete evidence;
- a PubChem evidence record whose content hash does not match its source structure, InChIKey, and CID;
- a structure on an unresolved/unverified case;
- dilution without active and carrier/solvent roles;
- a natural with a representative molecule;
- collapse of the tested enantiomer/isomer pairs;
- a trade-name-only case with a molecular identity;
- result accounting that does not total 50.

## Outputs

Running `npm run test:material-intelligence-pilot50` writes:

- `docs/v2/material-intelligence/PILOT50_RESULTS.json` as machine-readable evidence;
- `docs/v2/material-intelligence/PILOT50_RESULTS.md` as the review summary.

The output contains classifications, statuses, reason codes, and public source references only. It contains no tenant data, credentials, private documents, or production identifiers.

## Side effects

The runner reads the fixture, evaluates the pure policy, and writes local documentation artifacts. It has no database client, network client, Cloudflare client, GitHub client, or model runtime call.

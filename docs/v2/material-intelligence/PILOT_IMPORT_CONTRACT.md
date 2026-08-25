# Pilot 50 Import Contract

## Purpose and boundary

`services/scientific/testdata/material-intelligence-pilot50.json` is a deterministic local/test fixture. It is not a production import file and must never be sent to the V2 production migration or governed bulk-import endpoints.

## File contract

- `contractVersion`: exactly `material-intelligence-pilot/2.0.0`;
- `normalizationVersion`: the exact repository structure-normalization contract used by verified pilot records;
- `rdkitVersion`: the RDKit version used by that bounded normalization run;
- `retrievedAt`: one bounded evidence capture timestamp;
- `cases`: exactly 50 unique, ordered MaterialProduct cases `M001` through `M050`;
- `supportingEntities`: bounded ChemicalEntities needed only by explicit component links; they do not increase the MaterialProduct count.

Every case contains an explicit ChemicalEntity action and ID, product/entity classifications, resolution/evidence state, bounded research reason, identifier assertions, and full molecular fields or explicit nulls in the generated result. Verified single-substance cases additionally require a complete PubChem CID, source canonical/isomeric SMILES, repository-normalized canonical SMILES, InChI, InChIKey, formula, weight, structure hash, evidence content hash, and stereochemistry state. CAS remains an identifier assertion and never satisfies the structure-evidence gate.

Components declare role, concentration, evidence status, and a verified/reviewed ChemicalEntity link. Geranial, Neral, Ambroxide, and Ethyl Vanillin reuse their primary pilot entities; Ambermax, triethyl citrate, dipropylene glycol, indole, and ethanol use five bounded supporting entities. The four named dilution cases require an active plus carrier/solvent component and exact concentrations summing to 100 percent.

## Fail-closed validation

The runner rejects:

- any count other than 50 or any missing/duplicate/out-of-order case ID;
- a verified identity without complete evidence;
- a PubChem evidence record whose content hash does not match its source structure, InChIKey, and CID;
- a structure on an unresolved/unverified case;
- dilution without active and carrier/solvent roles;
- a natural with a representative molecule;
- collapse of the tested enantiomer/isomer pairs;
- a molecular identity supported only by trade-name, product, composition, CAS, or unrelated-subject evidence;
- a missing component ChemicalEntity link;
- result accounting that does not total 50.

## Outputs

Running `npm run test:material-intelligence-pilot50` writes:

- `docs/v2/material-intelligence/PILOT50_RESULTS.json` as machine-readable evidence;
- `docs/v2/material-intelligence/PILOT50_RESULTS.md` as the review summary.

The output distinguishes 50 MaterialProducts, 50 primary assessments, supporting entities, total unique entities, verified molecular identities, unresolved/complex entities, and component-link counts. Each case includes its ChemicalEntity action and molecular/result fields. It contains no tenant data, credentials, private documents, or production identifiers.

## Side effects

The runner reads the fixture, evaluates the pure policy, and writes local documentation artifacts. It has no database client, network client, Cloudflare client, GitHub client, or model runtime call.

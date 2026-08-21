# Mermaid Diagram Pack — OlfactoryOps V2

## Workspace provisioning

```mermaid
sequenceDiagram
  actor U as User
  participant W as Web
  participant A as Platform API
  participant DB as PostgreSQL

  U->>W: Sign up + workspace slug
  W->>A: Create organization
  A->>DB: Tx user + org + Owner membership
  A->>DB: Allocate <slug>.olfactoryops.com
  A->>DB: Create email-verification hash
  A-->>W: Verify email / onboarding
  U->>W: Verification link
  W->>A: Verify token
  A->>DB: Mark verified
```

## Custom domain

```mermaid
sequenceDiagram
  actor O as Owner
  participant UI as Settings
  participant API as Platform API
  participant CF as Cloudflare for SaaS
  participant DB as Host Registry

  O->>UI: Add perfume-company.com
  UI->>API: Request hostname
  API->>DB: PENDING
  API->>CF: Create custom hostname
  CF-->>API: DCV / SSL state
  API-->>UI: Validation instructions
  loop until active
    API->>CF: Refresh status
    CF-->>API: provider state
  end
  API->>DB: ACTIVE only after validation + SSL
```

## Material scientific enrichment

```mermaid
flowchart LR
  M[Material] --> I[CAS / SMILES / Identifiers]
  I --> RD[RDKit]
  RD --> B[BCFP]
  RD --> F[MolFTP]
  RD --> O[Osmordred]
  RD --> G[KGCNN]
  I --> T[Transformer-CNN]
  B --> FU[Feature Fusion]
  F --> FU
  O --> FU
  G --> FU
  T --> FU
  FU --> E[Odor Embedding]
  E --> P[Prediction]
  E --> S[Similarity]
  FU --> X[Explainability]
```

## Procurement / inventory

```mermaid
flowchart LR
  N[Need] --> O[Supplier Offer]
  O --> PO[PO]
  PO --> GR[Goods Receipt]
  GR --> Q[Quarantine Lot]
  GR --> LC[Landed Cost]
  Q --> QC[QC]
  QC -->|Pass| A[Available]
  A --> F[FEFO]
  QC -->|Fail| R[Return / Reject]
```

## Lab weighing

```mermaid
sequenceDiagram
  actor T as Technician
  participant UI as PWA
  participant INV as Inventory
  participant W as Weighing
  participant DB as Ledger

  T->>UI: Open weighing
  UI->>INV: Eligible lots
  INV-->>UI: FEFO suggestions
  T->>UI: Lot + actual weight
  UI->>W: Confirm
  W->>W: Validate
  W->>DB: Consumption movement + trace
  DB-->>W: Commit
  W-->>UI: Complete
```

## Design Studio

```mermaid
sequenceDiagram
  actor P as Perfumer
  participant DS as Design Studio
  participant AG as Agent Runtime
  participant LLM as LLM
  participant RAG as Evidence RAG
  participant SCI as Scientific API
  participant F as Formula

  P->>DS: Raw brief
  DS->>AG: Structure brief
  AG->>LLM: Typed interpretation
  LLM-->>AG: Proposal
  AG-->>DS: Human review required
  P->>DS: Approve/edit
  DS->>AG: Generate candidates
  AG->>RAG: Retrieve evidence
  AG->>SCI: Predictions / similarity
  RAG-->>AG: Citations
  SCI-->>AG: Scientific results
  AG-->>DS: Candidates
  P->>DS: Save selected
  DS->>F: Create Formula Draft
```

## Trials & sensory learning

```mermaid
flowchart LR
  FV[Formula Version] --> T[Trial]
  T --> W[Lab Weighing]
  W --> S[Sample / Conditioning]
  S --> E[Sensory Session]
  E --> D[Decision]
  D --> M[Private Sensory Memory]
  M --> P[Preference Profile Version]
  P -. bounded ranking .-> DS[Future Design Studio]
```

## Production trace

```mermaid
flowchart LR
  FV[Formula Version] --> PO[Production Order]
  RL[Raw Lots] --> W[Weighing]
  PO --> W
  W --> B[Batch]
  B --> QC[QC]
  QC --> R[Release]
  R --> FG[Finished Good Lot]
  FG --> RES[Reservation]
  RES --> SH[Shipment]
  SH --> O[Order Fulfilled]
```

## Agent tool security

```mermaid
flowchart TD
  L[LLM Output] --> V[Schema Validation]
  V --> R[Allow-listed Tool Registry]
  R --> P[Tenant + Permission]
  P --> Q{Write?}
  Q -->|No| D[Domain / Scientific Service]
  Q -->|Yes| H[Human Confirmation if required]
  H --> I[Idempotency + Revalidation]
  I --> D
  D --> A[Audit + Typed Artifact]
```

## Provenance chain

```mermaid
flowchart LR
  SRC[External Source] --> DS[Dataset Registry]
  DS --> TR[Transformation]
  TR --> RUN[Training Run]
  RUN --> M[Model Registry]
  M --> P[Prediction]
  DS --> LIC[License + Citation]
  P --> S[Material / Molecule]
```

# OlfactoryOps V2 — Architecture

## 1. System context

```mermaid
flowchart LR
  PERF[Perfumer / Creator]
  LAB[Lab Technician]
  RND[R&D Scientist]
  PROC[Procurement]
  OWN[Owner / Admin]
  BRAND[Brand / Client]
  SUP[Supplier]

  O[OlfactoryOps V2]

  PERF --> O
  LAB --> O
  RND --> O
  PROC --> O
  OWN --> O
  BRAND --> O
  SUP --> O

  O --> CF[Cloudflare Edge / for SaaS]
  O --> LLM[External LLM Providers]
  O --> OS[Osmo Open-Source Scientific Stack]
  O --> INT[Email / Push / Billing Integrations]
```

## 2. Module map

```mermaid
flowchart TB
  ROOT[OlfactoryOps V2]

  ROOT --> PLATFORM[Platform / SaaS]
  ROOT --> LABOPS[Lab Operations]
  ROOT --> AI[AI Intelligence]

  PLATFORM --> AUTH[Identity / Sessions / CSRF]
  PLATFORM --> TEN[Tenant / RBAC / Branding]
  PLATFORM --> DOM[Domains / Cloudflare for SaaS]
  PLATFORM --> BILL[Billing]
  PLATFORM --> NTF[Notifications]
  PLATFORM --> PRIV[Privacy / Audit / Observability]

  LABOPS --> MAT[Materials]
  LABOPS --> SUP[Suppliers]
  LABOPS --> INV[Inventory]
  LABOPS --> PRC[Procurement]
  LABOPS --> PROD[Production]
  LABOPS --> TS[Trials & Sensory]
  LABOPS --> COM[Optional Commerce]

  AI --> SCI[Molecular AI]
  AI --> OLF[Olfactory AI]
  AI --> FI[Formula Intelligence]
  AI --> AG[Agentic AI]

  SCI --> FI
  OLF --> FI
  FI --> DS[Design Studio]
  DS --> TS
```

## 3. Scientific Core — Osmo-based

```mermaid
flowchart TB
  MOL[Molecule / SMILES]
  MOL --> RD[RDKit Structure Engine]

  RD --> BCFP[BCFP / ECFP]
  RD --> FTP[MolFTP]
  RD --> OSM[Osmordred]
  RD --> GRAPH[Molecular Graph]
  MOL --> SMI[SMILES path]

  GRAPH --> GNN[KGCNN models]
  SMI --> TCNN[Transformer-CNN]

  BCFP --> FUS[OlfactoryOps Feature Fusion]
  FTP --> FUS
  OSM --> FUS
  GNN --> FUS
  TCNN --> FUS

  FUS --> ME[Molecular Embedding]
  ME --> OE[Odor Embedding]

  OE --> P[Odor Prediction]
  OE --> SIM[Similarity Search]
  FUS --> EXP[Explainability]

  P --> FI[Formula Intelligence]
  SIM --> FI
  EXP --> FI
```

## 4. Authority boundary

```mermaid
flowchart LR
  USER[User] --> AG[LLM / Agent]
  AG --> TOOL[Typed Tool]
  TOOL --> AUTH[Permission + Tenant Gate]
  AUTH --> DOMAIN[Authoritative Domain / Scientific Service]
  DOMAIN --> DB[(System of Record)]
  DOMAIN --> RESULT[Validated Result]
  RESULT --> AG
  AG --> USER

  AG -. prohibited direct write .-> DB
```

## 5. Service topology

```mermaid
flowchart TB
  DNS[Cloudflare DNS / for SaaS]
  DNS --> EDGE[Tenant Router / API Edge]
  EDGE --> WEB[React / PWA]
  EDGE --> API[API / BFF]

  API --> PLAT[Platform Service]
  API --> LAB[Lab Domain Service]
  API --> FORM[Formula Service]
  API --> TRIAL[Trials / Sensory]
  API --> AGENT[Agent Runtime]

  AGENT --> LLM[External LLM Gateway]
  AGENT --> RAG[RAG Service]
  AGENT --> SCI[Scientific API]
  FORM --> SCI
  LAB --> SCI

  SCI --> OSMO[Osmo / RDKit Adapters]

  PLAT --> PG[(PostgreSQL)]
  LAB --> PG
  FORM --> PG
  TRIAL --> PG
  AGENT --> PG
  RAG --> PG

  SCI --> OBJ[(Object Storage)]
  RAG --> OBJ
  RAG --> VEC[(Vector Store)]
  SCI --> VEC
```

## 6. Design Studio intelligence loop

```mermaid
flowchart LR
  B[Raw Brief] --> L[LLM Structured Proposal]
  L --> R[Human Review]
  R --> C[Validated Constraints]
  C --> M[Material Universe Snapshot]
  M --> S[Scientific + RAG Evaluation]
  S --> D[Candidate Directions]
  D --> P[Perfumer Review]
  P --> F[Formula Draft]
  F --> A[Formula Approval]
  A --> T[Trial]
  T --> SE[Sensory Evidence]
  SE --> MEM[Private Sensory Memory]
  MEM -. bounded ranking signal .-> S
```

## 7. Workspace domain model

```mermaid
flowchart LR
  SLUG[Workspace slug] --> DEF[abc.olfactoryops.com]
  OWN[Owner] --> CUSTOM[Customer domain]
  CUSTOM --> CF[Cloudflare for SaaS]
  CF --> DCV[DNS / DCV]
  DCV --> SSL[SSL Active]
  SSL --> REG[Hostname Registry ACTIVE]
  DEF --> ROUTER[Tenant Router]
  REG --> ROUTER
  ROUTER --> ORG[Organization]
```

## 8. Operational trace

```mermaid
flowchart LR
  MOL[Molecule] --> MAT[Material]
  MAT --> LOT[Inventory Lot]
  MAT --> FV[Formula Version]
  LOT --> TR[Trial]
  FV --> TR
  TR --> SD[Sensory Decision]
  LOT --> PB[Production Batch]
  FV --> PB
  PB --> FG[Finished Good Lot]
  FG --> ORD[Order / Shipment]

  DATA[Dataset] --> MODEL[Model]
  MODEL --> PRED[Prediction]
  PRED --> MAT
  AG[Agent Run] --> PRED
```

## 9. Sentiment & Consumer Intelligence

```mermaid
flowchart TB
  REV[Reviews] --> ING[Feedback Ingestion]
  FB[Brand / Project Feedback] --> ING
  SUR[Surveys] --> ING
  ING --> LANG[Language Detection EN/VI]
  LANG --> SENT[Sentiment Analysis]
  SENT --> ASPECT[Aspect-Based Sentiment]
  ASPECT --> PER[Emotion / Perception]
  PER --> OLF[Olfactory Language Mapping]
  OLF --> PREF[Consumer Preference Vector]
  PREF --> FI[Formula Intelligence]
  PREF --> DS[Design Studio]
  PREF --> INS[Consumer / Market Insights]
  MEM[Private Sensory Memory] --> FI
  SCI[Molecular / Olfactory Intelligence] --> FI
```

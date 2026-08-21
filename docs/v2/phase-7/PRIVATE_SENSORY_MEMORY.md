# Phase 7 Private Sensory Memory

## Khi nao memory duoc tao

Private sensory memory khong phai la nguon truth cho Formula, compliance,
inventory hay Production. No chi duoc tinh trong `decideTrial`, sau khi:

1. Trial dang `EVALUATED`.
2. Co it nhat mot preparation `CONFIRMED`.
3. Moi sensory session cua Trial da `CLOSED`.
4. Actor co `trials.decide` va cung tenant context.

Service chi lay evaluation `SUBMITTED` tu session `CLOSED`. Draft, voided,
session chua dong, va data tenant khac khong vao input. Quy trinh luu Trial
decision cua con nguoi va version memory trong cung transaction.

## Nguong evidence va confidence

Evidence count la so danh tinh doc lap, khong phai tong so submission:

- internal scorecard duoc dinh danh boi `evaluator_user_id`;
- public scorecard duoc dinh danh boi `public_link_id`;
- nhieu scorecard tu cung mot evaluator hoac cung public link chi dong gop mot
  danh tinh vao `evidenceCount`.

`minimumEvidenceCount` la gia tri lon nhat cua sensory form version tham gia;
neu chua co row thi mac dinh la 3. Khi `evidenceCount < minimumEvidenceCount`,
projection contract tra `confidence = NOT_ENOUGH_EVIDENCE`; neu dat nguong thi
tra `VERIFIED`.

Database su dung ten state khac mot chut: `NOT_ENOUGH_EVIDENCE` duoc luu nhu
vay, con `VERIFIED` cua contract duoc luu `evidence_status = SUFFICIENT`.
Numeric confidence la 0 khi thieu nguong, hoac `min(1, evidenceCount /
minimumEvidenceCount)` khi dat nguong. Khong duoc nham `SUFFICIENT` voi mot
ket luan Formula, compliance hay Production tu dong.

## Aggregate va provenance

`private-sensory-memory/1` tinh:

- `performanceProfile`: trung binh rating theo dimension;
- `timepointProfile`: trung binh rating theo timepoint va dimension;
- `descriptorProfile`: tan suat descriptor chuan hoa trong khoang 0-10;
- `conclusion`: hoac thong bao thieu scorecard doc lap, hoac aggregate
  tenant-private tu scorecard versioned da hoan tat.

Memory luon versioned trong `v2_private_sensory_memories` va
`v2_private_sensory_memory_versions`. Moi version luu aggregation algorithm,
input-evidence hash, source-set hash, evidence count, confidence, profile va
nguoi sinh. `v2_private_sensory_memory_sources` ghi tung sensory-evaluation
source hash, de snapshot co the doi chieu thay vi phu thuoc vao mot aggregate
khong ro nguon.

## Retrieval va boundary

`GET /v2/trials/formula-versions/:formulaVersionId/memory` can
`trials.viewAll`.
No chi tra toi da 20 memory hien tai cua Trial `CLOSED` trong cung tenant co
`formula_version_id` trung khop, kem decision, evidence projection, timestamp
va provenance family `PRIVATE_SENSORY_MEMORY`.

Manual experiment khong co Formula Version nen khong xuat qua lookup nay. Ket
qua memory la advisory evidence co nguong, khong co endpoint Phase 7 nao dung
no de sua Formula, tao Draft, phe duyet Formula, tao Production order hay di
chuyen ton kho.

# OlfactoryOps V2 Phase 7 Implementation Report

## Verdict tai thoi diem cap nhat tai lieu

Phase 7 co implementation end-to-end cho Trial, sensory session, public
scorecard va private sensory memory. Tat ca gate repository-local trong bang
duoi da `PASS` tren disposable loopback PostgreSQL va browser fixture test.
Khong co remote migration, external provider hay production deployment trong
checkpoint nay; cac muc do la `NOT_APPLICABLE` theo scope local.

## Implementation da co trong source

| Surface | Evidence source |
|---|---|
| Trial source, version, release, preparation, sample, evidence va decision | `0011_phase7_trials_sensory.sql`, `TrialSensoryService` |
| Formula snapshot, deterministic weighing va Phase 2 immutable consumption/reversal link | `TrialSensoryService` + `LabOperationsService` bridge |
| Versioned sensory form, session, panel/sample assignment, blind/unblind va scorecard | contract, migration va `TrialSensoryService` |
| Token-hash public presentation/evaluation va revoke/count/expiry guard | migration resolver + public controller/service |
| Tenant-private, versioned sensory memory co threshold va source hashes | migration + `memoryProjection`/`persistMemory` |
| Authenticated API CSRF/Origin/idempotency/audit boundary | `v2-trials-sensory.controller.ts` + service |
| Public link-scoped idempotency va panelist `/assignments/me` projection | `v2_sensory_public_submission_requests` + service/controller |

Bang tren xac nhan source surface da duoc doc; no khong la ket qua runtime.

## Gate can chay

| Gate | Lenh/evidence ky vong | Trang thai hien tai |
|---|---|---|
| Contract validation | `npm.cmd test -- packages/contracts/src/trials-sensory.test.ts` | PASS - 6 tests |
| Full unit/regression suite | `npm.cmd test` | PASS - 39 files, 267 tests |
| V2 typecheck va API build | `npm.cmd run typecheck:v2`; `npm.cmd run build:api` | PASS |
| Migration schema/RLS declaration | `npm.cmd run v2:postgres:verify` voi loopback test database da cau hinh | PASS - `V2_POSTGRES=PASS` |
| Application-role RLS workflow | `npm.cmd run v2:postgres:rls` | PASS |
| Frontend build va lint | `npm.cmd run build`; `npm.cmd run lint` | PASS |
| Authenticated browser/role workflow | `npm.cmd run test:v2:role-e2e` | PASS - 12 independent roles |
| Client secret scan va dependency audit | `npm.cmd run security:client-bundle`; `npm.cmd audit --omit=dev --audit-level=high` | PASS |
| Remote migration va production deploy | Ngoai pham vi cua checkpoint local Phase 7 | NOT_APPLICABLE |

## Muc tieu acceptance cua RLS harness

Fresh PASS cua `scripts/verify-v2-rls.ts` tren disposable PostgreSQL da bao
phu cac assertion Phase 7 sau:

- Formula Trial plan/release, confirmed preparation, duplicate confirmation
  idempotent, nhieu sample va evidence.
- Blind public presentation, public scorecard, internal panel scorecard,
  public-link idempotency replay, panelist `/assignments/me`, controlled
  unblind va human decision.
- Default Brand session bi tu choi khi doc Trial detail (`brandTrialDetailDenied`),
  trong khi public blind presentation/evaluation qua opaque link van PASS.
- Memory thieu hai scorecard doc lap so voi nguong ba phai la
  `NOT_ENOUGH_EVIDENCE`.
- Direct reversal khong dung Trial workflow bi tu choi; reversal qua Trial link
  tao lien ket `REVERSED` co `reversalMovementId`.
- Panelist chi thay Trial duoc gan active va khong thay Formula snapshot,
  preparation, sample internal code, evidence, inventory usage hay Trial chua
  duoc gan; Trial tenant khac bi tu choi.

## Dieu kien de dong checkpoint

`PHASE_7_READY = YES` cho repository-local checkpoint. External production
configuration va deploy khong duoc suy dien tu ket qua nay.

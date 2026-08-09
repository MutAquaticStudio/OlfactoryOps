# OlfactoryOps V2 Phase 7 - Trials, Sensory Sessions va Private Sensory Memory

## Muc dich

Phase 7 dua Trial tu Formula Version da duoc phe duyet hoac mot thuc nghiem
thu cong co ghi nhan nguon den chuan bi mau, danh gia sensory, quyet dinh cua
con nguoi va private sensory memory co provenance. Day la mot boundary V2
tach biet; no khong thay doi Formula, Production hay Inventory bang thao tac
client-side.

## Pham vi implementation

- Migration bo sung `infra/postgres/migrations/0011_phase7_trials_sensory.sql`.
- Contract Zod trong `packages/contracts/src/trials-sensory.ts` va test hop dong
  trong `packages/contracts/src/trials-sensory.test.ts`.
- Service server-authoritative `services/trials-sensory/src/service.ts`.
- Controller authenticated `/v2/trials/*` va controller token-scoped
  `/v2/public/sensory/:token`.
- Tich hop voi Lab Operations Phase 2 qua Lab Weighing va immutable inventory
  movement; Formula Version va inventory movement van do cac phase truoc so huu.

Khong co Formula Draft tu dong, Formula approval tu dong, Production release,
hay public truy cap vao thanh phan cong thuc, lot, gia von, CAS hoac ghi chu
noi bo trong pham vi nay.

## Cach doc

1. [Trial va sensory domain](TRIAL_AND_SENSORY_DOMAIN.md) mo ta state machine,
   release, weighing, sample, scorecard va quyet dinh.
2. [Privacy va public access](PRIVACY_AND_PUBLIC_ACCESS.md) mo ta RLS,
   redaction, quyen, CSRF va public link.
3. [Private sensory memory](PRIVATE_SENSORY_MEMORY.md) mo ta nguong evidence,
   aggregation, version va provenance.
4. [Phase 7 implementation report](PHASE_7_IMPLEMENTATION_REPORT.md) liet ke
   cac gate can chay va trang thai bang chung hien tai.

## Quy uoc bang chung

Fresh run cua `npm.cmd run v2:postgres:verify`,
`npm.cmd run v2:postgres:rls`, `npm.cmd test`, lint/build, secret/dependency
scan va `npm.cmd run test:v2:role-e2e` deu da `PASS` tren disposable loopback
test database. Su hien dien cua migration, contract, service hoac controller
chi duoc coi la checkpoint complete khi co bang chung runtime nay.

- `PASS` chi duoc ghi sau khi gate dung pham vi da chay thanh cong va co output
  de doi chieu.
- `BLOCKED` chi dung khi mot gate bat buoc thieu dependency hay bang chung
  runtime hien tai; no khong ket luan code da fail.
- `FAIL` chi dung khi mot gate da chay va that bai.
- `NOT_APPLICABLE` chi dung cho gate thuc su nam ngoai checkpoint, khong dung
  de che mot gate chua chay.

Chi tiet gate va ranh gioi `NOT_APPLICABLE` nam trong
`PHASE_7_IMPLEMENTATION_REPORT.md`.

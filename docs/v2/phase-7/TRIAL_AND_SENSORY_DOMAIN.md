# Phase 7 Trial va Sensory Domain

## Nguon va version cua Trial

Mot Trial chi co mot trong hai nguon:

- `FORMULA_VERSION`: phai chi den Formula Version da `APPROVED`; service lay
  snapshot, content hash, thanh phan va kiem tra tong 100 percent.
- `MANUAL_EXPERIMENT`: phai co `manualSource` ro rang va khong duoc gan ngam
  Formula Version.

Khi Formula Version duoc dung, service tu choi Formula rong, tong phan tram
khac 100 hoac Material khong `ACTIVE`. Release kiem tra lai compliance cua
Material: Material `BLOCKED` bi tu choi; bang chung IFRA/compliance chua du
chi ghi `REVIEW_REQUIRED`, khong bi dien thanh ket qua dat. Thuc nghiem thu
cong nhan `NOT_EVALUATED` cho review nay, nhung van luu rationale va snapshot
thay vi tu nhan co du lieu compliance.

Moi thay doi lifecycle tao `v2_trial_versions` co snapshot va SHA-256 content
hash. Version hien tai duoc supersede truoc khi version moi duoc ghi; Trial
khong lay lai Formula Draft de thay doi composition da da duoc snapshot.

## Trial state machine

```text
DRAFT -> PLANNED -> READY -> IN_PROGRESS -> PREPARED
      -> EVALUATION_READY -> EVALUATED -> CLOSED

DRAFT | PLANNED | READY -> CANCELLED
```

- `planTrial` chuyen `DRAFT -> PLANNED`.
- `releaseTrial` yeu cau `trials.release` va `formula.approve`, ghi Trial
  release gate snapshot, roi chuyen `PLANNED -> READY`.
- `startPreparation` chuyen `READY -> IN_PROGRESS`; no yeu cau release cua
  Trial Version hien tai.
- Xac nhan weighing thanh cong chuyen `IN_PROGRESS -> PREPARED`.
- `createSample` chuyen `PREPARED -> EVALUATION_READY` cho mau dau tien va
  cung chap nhan Trial dang `EVALUATION_READY` cho cac mau tiep theo. Nhieu
  mau co the duoc tao tu preparation `CONFIRMED` truoc khi Trial chuyen sang
  `EVALUATED` khi sensory session dong.
- Khi dong mot sensory session, service chuyen Trial
  `EVALUATION_READY -> EVALUATED` neu Trial dang o state do. `decideTrial`
  van yeu cau tat ca sensory session cua Trial da `CLOSED` truoc khi chuyen
  `EVALUATED -> CLOSED`.

`CANCELLED` khong co transition tu `IN_PROGRESS`, `PREPARED`,
`EVALUATION_READY`, `EVALUATED` hay `CLOSED`. Service dung row lock va tra
`TRIAL_STATE_INVALID` neu transition khong nam trong bang tren.

## Chuan bi, immutable ledger va reversal

Trial khong ghi scalar ton kho. `startPreparation` goi
`LabOperationsService.createWeighingSession` voi `contextType = TRIAL`; neu
Trial co Formula snapshot, tung line weighing phai dung Material va khoi luong
duoc tinh xac dinh tu planned mass x percentage / 100.

`confirmPreparation` goi `LabOperationsService.confirmWeighing`. Phase 2 la
ben ghi authoritative cho immutable `CONSUMPTION` movement va cac kiem tra
lot/reservation. Sau khi xac nhan, Phase 7 chi tao lien ket provenance:

- `v2_trial_usage_links` giu Formula/manual checksum, actual-weight snapshot,
  cost snapshot va trang thai `COMMITTED` hoac `REVERSED`.
- `v2_trial_material_usages` lien ket moi weighing line voi Material, lot,
  inventory movement, khoi luong thuc te va landed-cost snapshot/hash.
- Preparation chuyen sang `CONFIRMED`; Trial chuyen sang `PREPARED`.

Reversal khong xoa consumption. `reversePreparationConsumption` uy quyen cho
`LabOperationsService.reverseMovement`, sau do danh dau usage link va
preparation la `REVERSED` va luu `reversal_movement_id`. Mot inventory
movement khong lien ket voi Trial bi tu choi o workflow nay.

Schema co cac state preparation `PLANNED`, `WEIGHING`, `CONFIRMED`, `ABORTED`
va `REVERSED`; route/service hien tai tao `WEIGHING`, xac nhan `CONFIRMED` va
chi reversal co kiem soat sang `REVERSED`. Khong co route chung de tao
`ABORTED` trong checkpoint nay.

## Mau va evidence

Sample phai duoc tao sau preparation `CONFIRMED`. `sampleCode` bi gioi han
bang contract va unique theo tenant; `blindCode` duoc sinh server-side, hash
bang SHA-256 trong `v2_trial_samples`, va sample bat dau o `AVAILABLE`.
Assignment sensory chuyen sample sang `ASSIGNED`; schema cung du phong
`EXPIRED` va `DISPOSED` va khong cho gan hai state nay vao session.

Evidence cua Trial la reference/hash, khong phai document payload: evidence
kind, `objectRef`, SHA-256 `contentHash` va lien ket tuy chon den preparation
hoac sample cua cung Trial. Them evidence can `trials.create` va
`documents.manage`; duplicate cung tenant/trial/kind/ref/hash tro ve evidence
da co qua idempotent path.

## Sensory form, session va scorecard

Sensory form la version co content hash. Contract bat buoc timepoint va
dimension key khong trung; rating co min/max, `ORDINAL` va `DESCRIPTOR` phai
co option co kiem soat, va descriptor co the bi gioi han boi vocabulary. Form
duoc tao `ACTIVE` trong service hien tai.

```text
Session: DRAFT -> SCHEDULED -> OPEN -> IN_PROGRESS -> CLOSED
         DRAFT | SCHEDULED | OPEN | IN_PROGRESS -> VOIDED
```

Controller chi nhan target `SCHEDULED`, `OPEN`, `CLOSED`, `VOIDED`.
`IN_PROGRESS` la transition server-side khi scorecard dau tien duoc ghi. Dong
session can it nhat mot evaluation `SUBMITTED`.

Panelist phai la workspace member `ACTIVE`; service tao assignment rieng cho
tung panelist va mot public/brand-safe slot co `panel_assignment_id = NULL`.
Mot blind code trung trong cung session bi tu choi neu no dai dien cho sample
khac. Unblind can `sensory.unblind`, rationale khong rong, row lock, audit va
chuyen assignment `BLINDED -> UNBLINDED` mot lan.

Evaluation chi duoc ghi khi session `OPEN` hoac `IN_PROGRESS`, sample duoc gan
dung evaluator, va payload dung form version. Required ratings, range,
timepoint va descriptor vocabulary deu duoc validate server-side. Final
internal scorecard (`SUBMITTED`) la immutable; public link co the sua scorecard
cua chinh link trong khi session van mo, tang `revision` va ghi audit rieng.

## Quyet dinh cua con nguoi

`decideTrial` can `trials.decide`, Trial `EVALUATED`, it nhat mot preparation
`CONFIRMED`, va moi sensory session `CLOSED`. Cac quyet dinh hop le la:

- `ACCEPT_DIRECTION`
- `REVISE_FORMULA`
- `RETEST`
- `REJECT_DIRECTION`
- `PROMOTE_FOR_PRODUCTION_REVIEW`

Quyet dinh luu rationale, evidence snapshot/hash, Trial Version va audit; no
khong tu tao Formula Draft, khong phe duyet Formula va khong release Production.

# Phase 7 Privacy, Redaction va Public Access

## Tenant boundary va authorization

`TrialSensoryService` mo moi transaction bang `app.organization_id` va
`app.user_id`. Tat ca mutation authenticated deu qua permission cua
`PlatformService`, idempotency record tenant/actor/route/key, row lock khi
can, va `v2_audit_events` chi luu payload hash. Controller `/v2/trials/*`
doi hoi opaque session cookie, host-resolved context, Origin hop le va CSRF
token truoc mutation.

Quyen Phase 7 duoc chia nho:

| Permission | Boundary |
|---|---|
| `trials.viewAll` | Doc toan bo Trial tenant va private sensory memory theo capability |
| `trials.viewAssigned` | Chi doc blind presentation cua Trial/session da duoc gan cho panelist hien tai |
| `trials.create` | Tao/plan Trial, preparation, sample, evidence, reversal |
| `trials.release` + `formula.approve` | Release Trial |
| `trials.decide` | Ghi quyet dinh dong Trial |
| `sensory.view` | Doc sensory form/assignment duoc phep |
| `sensory.evaluate` | Gui scorecard noi bo |
| `sensory.manage` | Form, session, panelist, sample assignment va public link |
| `sensory.unblind` | Unblind co rationale va audit |

`documents.manage` la permission bo sung khi attach Trial evidence. Tat ca
mutation authenticated yeu cau `Idempotency-Key` dai 12-200 ky tu. Public
scorecard khong dung cookie session, nhung van bat buoc mot
`Idempotency-Key` 12-200 ky tu trong boundary rieng cua public link.

Default role `Brand` khong duoc cap `trials.viewAll`, `trials.viewAssigned`
hay `sensory.view`; mot
Brand session khong the doc Trial detail hoac broad sensory data qua
`/v2/trials/*`. Brand-facing access trong Phase 7 chi la opaque public
scorecard link, duoc resolve va gioi han boi token hash, expiry, revoke va
submission cap.

`Sensory Panelist` mac dinh chi co `trials.viewAssigned`, khong co
`trials.viewAll`. Service loc ca danh sach va direct-ID read theo active panel
assignment. Trial chua duoc gan tra `TENANT_ACCESS_DENIED`; Trial duoc gan chi
tra blind title/session va scorecard cua chinh panelist, khong tra Formula,
sample internal code, preparation, evidence, decision, lot hay cost.

## RLS va foreign-key tenant scope

Migration `0011_phase7_trials_sensory.sql` bat `ENABLE ROW LEVEL SECURITY` va
`FORCE ROW LEVEL SECURITY` cho Trial, version/release/preparation/usage/sample/
evidence, sensory form/session/assignment/evaluation, public-submission
idempotency, decision va private memory/job tables. Policy `v2_tenant_scope`
yeu cau `organization_id` trung `app.organization_id` cho ca read va write.

Migration cung them composite tenant foreign key cho cac quan he Phase 7 va
quan he den Formula, Lab Weighing, inventory movement, Material, lot va user.
Vi vay ID cua tenant khac khong the duoc gan vao aggregate Phase 7 chi bang
mot foreign key don le.

## Recipient-safe internal projection

`detail` chi tra field nhay cam theo capability:

- Formula Version ID va Formula snapshot can `formula.viewSensitive` va
  `trials.viewAll`.
- Material/lot usage chi xuat khi co `inventory.view`.
- Landed unit cost va currency chi xuat them khi co `costing.view`.
- `objectRef` cua Trial evidence chi xuat khi co `documents.view`; content hash
  va evidence kind co the dung de doi chieu provenance.
- Evaluation trong Trial detail chi la scorecard cua chinh evaluator, va chi
  duoc truy van khi co `sensory.view`.
- Danh sach sensory assignment cho nguoi khong co `sensory.manage` chi tra
  assignment cua chinh panelist; manager moi thay panel-assignment/user ID.
- `GET /v2/trials/sessions/:id/assignments/me` can `sensory.evaluate` va
  panel assignment `ACTIVE`; no chi tra session/form da version hoa, blind
  code, sample status va final flag cua chinh panelist.

Phase 7 khong tuyen bo rang observation/comparison text khong duoc luu: chung
la du lieu scorecard tenant-private trong `v2_sensory_evaluations`. Redaction
o day noi ve projection/authorization; retention va consent policy bo sung
can duoc danh gia rieng truoc khi mo rong public collection.

## Public sensory link

Public link chi gan voi public-safe sample assignment (`panel_assignment_id =
NULL`) cua session con `DRAFT`, `SCHEDULED`, `OPEN` hoac `IN_PROGRESS` tai luc
cap. Service sinh token ngau nhien 32 byte, chi luu SHA-256 `token_hash`, tra
token mot lan trong response tao link, va luu expiry, revocation va submission
counter.

Resolver duy nhat cho unauthenticated lookup la
`v2_resolve_sensory_public_link(token_hash)`:

- la `SECURITY DEFINER`, co `search_path` co dinh;
- chi tra link con hieu luc: token hash trung, chua revoke, chua het han va
  submission count chua dat gioi han;
- `REVOKE ALL ... FROM PUBLIC`; chi `v2_app` duoc grant execute khi role ton
  tai;
- khong lookup bang public link ID do caller cung cap.

Sau khi resolver tra ve link, service dat tenant context tu `organization_id`
da resolve truoc khi doc/ghi sensory record. RLS cua bang public link cho phep
lookup bo sung bang `app.sensory_link_hash`, nhung `WITH CHECK` van yeu cau
tenant context cho write. Revoke dat `revoked_at` va lap tuc ngan resolver tra
link trong lan dung sau.

Public presentation chi hop le khi session `OPEN` hoac `IN_PROGRESS`:

- `BLIND` chi tra blind code, title `Blind sensory sample`, instructions va
  form version.
- `BRAND_REVIEW` co the tra sample code va Trial title, cung instructions va
  form version.

Ca hai mode khong tra Formula composition, Formula Version, Material/lot,
landed cost, CAS, internal comment, internal decision hay panelist identity.
Body public evaluation khong nhan sample-assignment ID; service gan assignment
da bi khoa cua token. Submit dung row lock, chi cho timepoint cua form, gioi
han submission theo link (contract API: 1-100), va tang counter trong cung
transaction.

Moi public submit cung bat buoc `Idempotency-Key`. Bang
`v2_sensory_public_submission_requests` luu key, request hash va response theo
`organization_id + public_link_id`; cung key/cung payload replay lai response,
cung key/khac payload bi tu choi conflict, va khong tao submission hoac tang
counter lan hai. Bang nay cung nam trong forced tenant RLS, thay vi dung
ambient user session ma public caller khong co.

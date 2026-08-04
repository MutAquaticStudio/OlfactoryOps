# OlfactoryOps

## Thu vien Global Master Lluch

Catalogue Lluch Essence 2026 gom **1.986 Global Master Materials** da duoc
publish trong D1. Tat ca tenant co the tim kiem va su dung chung trong
Materials, Formula Design Studio, Reformulation Optimizer, RAG va formula draft.

- Master Material la read-only va co provenance, catalogue version/checksum,
  odour supplier-declared va technical evidence khi catalogue cung cap.
- `MASTER_APPROVED` chi co nghia **R&D-ready**: phu hop cho research va draft;
  khong phai ket luan IFRA, regulatory, supplier hay quality approval.
- Master Material khong the tao PO, goods receipt, inventory lot, reservation,
  lab consumption hay production release. Tenant phai tao material operational
  rieng, supplier/compliance evidence va lot rieng truoc cac buoc nay.
- Material do tenant tao van private. Neu trung CAS voi Master, ca hai ban ghi
  duoc giu rieng; ban ghi tenant duoc uu tien cho lot, cost va operational flow.

Worker tu dong reconcile catalogue theo source checksum va ghi audit
`material.global.publish`. Migrations `0041_lluch_global_master_materials.sql`
va `0042_lluch_master_cas_variants.sql` phai duoc ap dung truoc khi deploy
Worker. Migration 0042 giu cac supplier-grade Lluch rieng biet khi chung CAS,
nhung van giu CAS duy nhat cho Global curated materials ngoai catalogue.

### Hieu nang dang nhap

Route dang nhap Worker dung identity fast-path: chi nap credential, membership,
tenant role policy, session cua nguoi dang nhap va audit can thiet. Toan bo
operational graph, bao gom thu vien 1.986 Global Master Materials, khong duoc
hydrate truoc khi xac minh password. Session, membership activity, notification
outbox va audit-chain van duoc persist trong cung mutation; fast-path khong bo
qua tenant scope hay permission policy.

### Profile va sign-in

Trong **User settings**, moi thanh vien co the doi email va/hoac mat khau bang
cach xac minh mat khau hien tai. API server-side kiem tra email trung, rehash
credential theo email moi, huy reset token dang mo, revoke tat ca active session
va ghi audit event. Nguoi dung duoc dua ve Login sau khi cap nhat; email va mat
khau khong bao gio duoc luu hoac xac minh o frontend.

### Xac minh email

Signup tao Workspace, Owner va system hostname nhu truoc, dong thoi tao mot
email-verification record tenant-scoped. Token co 32 byte ngau nhien, chi luu
hash trong D1, het han sau 24 gio va khong bao gio di vao audit event, outbox,
frontend response hay Git. Link co dang `https://<web-host>/login?verify=...`;
nguoi dung nhan **Verify email** de hoan tat. Lap lai cung link tra ket qua an
toan nhu nhau, con link cu se bi revoke khi resend hoac khi email tai khoan doi.
Migration `0044_email_verification.sql` phai duoc ap dung truoc khi deploy Worker.

API:

- `GET /api/v1/auth/email-verification/status`: trang thai cua session hien tai.
- `POST /api/v1/auth/email-verification/resend`: cap token moi cho dung member
  dang dang nhap, co CSRF, idempotency va rate limit 3 lan/gio/session.
- `POST /api/v1/auth/email-verification/confirm`: public token confirmation,
  co rate limit 8 lan/gio/client va khong can session.

Worker chi gui mail sau khi D1 persist thanh cong. Can dat hai Worker secret
truoc khi delivery duoc bat:

~~~powershell
npx.cmd wrangler secret put RESEND_API_KEY
npx.cmd wrangler secret put EMAIL_FROM
~~~

`EMAIL_FROM` phai la sender da duoc xac minh trong Resend, vi du
`OlfactoryOps <notifications@labofscents.org>`. Neu mot trong hai secret chua
co, API/UI tra `not_configured`; signup van hoat dong va khong gia lap rang
email da duoc gui. Xac minh email hien la security signal va recovery control;
no chua chan login cua member cu trong khi rollout beta dang dien ra.

### Flow Formula Design Studio

Tao brief luu creative request truoc, sau do mo ngay **Complete brief** de xac
nhan formula type, concentration, IFRA category, thi truong va creative
direction. Chi structured brief da duoc review moi mo khoa **Generate directions**.
UI hien blocker cu the va prefill raw creative request trong review form; logic
server-side van giu gate nay de khong tao direction tu brief thieu compliance
context.

## Hoàn thiện Worker API

Cloudflare Worker tại `worker/index.ts` là API production duy nhất dưới
`/api/v1`. Mọi mutation đã xác thực (POST, PATCH, PUT, DELETE) mặc định yêu
cầu `Idempotency-Key` dài 8-160 ký tự. Cùng key và cùng payload sẽ trả lại kết
quả đã persist; dùng lại key với payload khác trả `409`. Frontend tự tạo header
này trong `requestApi`, còn API client bên ngoài phải gửi key khi retry.

Worker xác thực opaque session và CSRF trước khi parse JSON hoặc multipart của
route private. Upload SDS/CoA bị giới hạn 25 MB, tối đa 24 field multipart và
16 KB metadata mỗi field. Response API luôn `no-store`; CORS credential chỉ
cho phép exact origin trong `CORS_ORIGINS`. Cron dọn response idempotency đã
hoàn tất sau 7 ngày nhưng giữ record `PENDING` để không replay mù một mutation
đang cần điều tra.

Để phát hành Worker, áp toàn bộ migration `0001` đến `0039` trên đúng D1 rồi
chạy `npm.cmd run deploy:check`. Worker production chỉ deploy bằng
`npm.cmd run deploy:worker`; sau deploy kiểm tra `GET /api/v1/status` và
`GET /api/v1/health`. Nếu D1 không truy cập được, `/status` báo cả API và D1
`degraded`, không hiển thị trạng thái operational giả.

## Kiến trúc UX/UI Quiet Lab

Giao diện OlfactoryOps dùng một hệ thống Quiet Lab thống nhất: nền đen matte, chữ ivory, accent verdigris có kiểm soát và bố cục ưu tiên công việc vận hành. React Bits chỉ được dùng như lớp motion cục bộ trong `src/ui/motion/`; nó không thay thế design system và không mang thông tin bắt buộc.

- `src/styles/tokens.css`: nguồn token duy nhất cho màu, spacing, typography, radius, focus, semantic state và touch target 44px.
- `src/styles/shell.css`: sidebar theo quyền, topbar, page padding và responsive shell.
- `src/styles/components.css`: panel, form control, action, dialog/drawer, loading và focus contract dùng chung.
- `src/styles/features.css`: bố cục riêng của Formula Intelligence, Trials, Materials và các module nghiệp vụ.
- `src/index.css`: reset/base cùng phần legacy đang được di chuyển theo từng checkpoint; không thêm lớp override mới.

Formula Design Studio hiện dùng brief review theo 5 nhóm `Product`, `Creative`, `Performance`, `Constraints` và `Materials`. Desktop giữ composer, project list và direction detail theo ngữ cảnh; dưới 1120px direction detail dùng dialog/sheet có focus trap. Form dài có header/footer cố định, body cuộn độc lập và cảnh báo trước khi bỏ thay đổi chưa lưu.

Audit gốc và trạng thái remediation nằm trong `reports/ux-ui-audit-2026-08-02.md`. Các ảnh regression nằm trong `e2e/visual-snapshots/`.

~~~powershell
# Unit, typecheck và build
npm.cmd run test
npm.cmd run lint
npm.cmd run build

# Visual + accessibility public; authenticated flow tự skip nếu thiếu credentials
npm.cmd run test:ux

# Authenticated Design Studio QA với test tenant, không dùng dữ liệu production
$env:UX_TEST_BASE_URL='http://127.0.0.1:5173'
$env:UX_TEST_EMAIL='your-test-owner@example.test'
$env:UX_TEST_PASSWORD='your-test-password'
npx.cmd playwright test --config playwright.ux.config.ts
~~~

Visual gate hiện PASS cho public EN/VI và Owner Design Studio ở 1280/390px. Admin, Perfumer, Lab Manager, Sensory Panelist, Brand, Finance và Read-only vẫn phải chạy bằng fixture riêng trước khi gắn `beta.labofscents.org`; không được suy luận PASS từ Owner.

### Orders & Fulfillment

Order Board hỗ trợ mở drawer chi tiết để xem dòng SKU, giá, thuế, phí giao hàng,
địa chỉ nhận, hướng dẫn giao, reservation, fulfillment và chứng cứ hủy đơn. Đơn
chỉ được chỉnh khi còn ở `DRAFT`, `CONFIRMED` hoặc `HOLD` và chưa bắt đầu reserve,
pack, ship hay fulfill. Server luôn tính lại giá từ catalogue; cập nhật thông tin
không tạo inventory movement.

Hủy đơn yêu cầu lý do, giữ nguyên lịch sử audit và chỉ giải phóng reservation.
Danh sách vận chuyển gồm GHN, GHTK, Viettel Post, VNPost, J&T Express, Ahamove,
Local Courier cùng DHL, FedEx, UPS và Pickup. Migration
`0038_sales_order_details.sql` phải được áp dụng trước khi deploy Worker dùng các
trường contact, địa chỉ, customer reference, delivery instruction và cancellation.

## Competitive Moat: Phase 0-9

### Design Studio và nguồn Materials

Formula Design Studio không duy trì catalogue riêng. Khi review brief, phần
**Required materials** gọi API tenant-scoped để đọc đúng tập Materials đã
được review và phê duyệt trong workspace. Danh sách này cũng là nguồn duy
nhất cho deterministic direction generation ở cả Worker beta và local API.

Catalogue supplier ở trạng thái `SOURCE_ONLY`, material chưa review, material
bị `BLOCKED`, hoặc ID không thuộc workspace không thể được chọn làm required
material hay thành phần của direction có thể lưu. Tuy nhiên, catalogue global
được dùng ở bước **research**: Formula Agent và Design Studio tìm các global
master reference phù hợp, rồi RAG chỉ trả về citation/excerpt bị giới hạn từ
supplier-declared evidence. Inventory chỉ được kiểm tra cho material đã review
khi tạo direction để xếp hạng tính khả dụng; bước này không reserve hay consume
stock. Nếu chưa có Material nào được phê duyệt, Studio hiển thị trạng thái rõ
ràng và yêu cầu hoàn tất review trong **Materials** trước khi generate công thức.

API và giao diện phân biệt rõ **formula-ready materials** với **supplier
references**. 1.986 dòng Lluch là nguồn nhận dạng và truy xuất trong Materials,
không phải 1.986 nguyên liệu đã có odor, strength, IFRA, cost và compliance được
phê duyệt. Direction mới không còn cắt tập hợp hợp lệ xuống bốn dòng đầu hoặc
để số gram tồn kho lấn át hoàn toàn độ phù hợp. Engine dùng brief relevance,
availability có giới hạn, note tier và material-family diversity để chọn palette
6-24 nguyên liệu tùy tập hợp đã review và các material bắt buộc. Ba direction có
trọng tâm opening, heart và trail khác nhau. Tỷ lệ hiển thị là **100% concentrate
composition**; `finalProductConcentrationPercent` tiếp tục là nồng độ dùng để
đánh giá thành phẩm và IFRA. Direction cũ được giữ bất biến và được ghi rõ là
kết quả của selection policy trước đây.

### Luồng generate trong Design Studio

Mỗi Design Studio project luôn hiển thị workflow `Brief → Review → Generate → Draft`. Brief `RAW` hoặc `REVIEW_REQUIRED` hiển thị **Review required** cùng danh sách trường còn thiếu. Người có `formulas.approve` (Admin/Manager theo role mặc định) thấy hành động **Review & approve brief**; trong review sheet, nút chính chỉ chuyển thành **Approve brief & unlock directions** khi product, concentration, IFRA, market và creative descriptor hợp lệ. Khi chưa đủ dữ liệu, cùng nút đó lưu review requirements thay vì giả vờ đã approval. Approver có thể mở và xử lý mọi brief `BRIEFED` trong tenant; permission và tenant scope vẫn được kiểm tra ở Worker/local API. Nút tạo direction chỉ chuyển thành **Generate directions** sau brief `REVIEWED`; card luôn giải thích gate đang thiếu, gồm tải Materials hoặc phê duyệt ít nhất một formula-ready Material. Project đã có kết quả hiển thị **Directions generated** để tránh tạo trùng generation round.

### Vòng đời brief và loại công thức

Design Studio hỗ trợ hai loại brief rõ ràng: **Accord** và **Fine fragrance**.
Accord được tạo như một concentrate, không tự thêm carrier/solvent. Có thể tạo
direction và lưu draft khi chưa biết sản phẩm cuối, nhưng hệ thống đánh dấu
`final-product context required`; draft đó không thể submit review hoặc approve
cho đến khi perfumer lưu và xác nhận nồng độ của sản phẩm cuối và IFRA category. Fine fragrance
vẫn yêu cầu concentration và IFRA category ngay trong structured review.

Brief không còn cần xóa ngay khi người dùng đổi ý. Creator của brief hoặc
Workspace Owner/Admin có thể archive brief. Archive lập tức hủy generation run
đang hoạt động, hết hạn confirmation đang chờ và revoke mọi direction share.
Brief bị ẩn khỏi danh sách active, có thể xem trong Archive và restore nguyên
trạng thái làm việc trước đó. Worker chỉ purge sau 30 ngày đối với brief không
có direction hay research run bền vững, để không phá formula, trial và audit
evidence đã được tạo.

### Phase 4: Direction to Trial

A saved Formula Design Studio direction can enter **Trials & Sensory** only
after the existing formula review and approval workflow has produced an
immutable approved version. The planned trial retains compact private
provenance for the project, direction, reviewed brief, constraint snapshot,
material-universe hash, and candidate evaluation hash.

Planning a trial never reserves or consumes inventory. Existing **Lab Usage
commit** remains the sole operation that records material movements and links
actual weights and lots to the trial.

### Phase 5: Completed Trial Evidence

Formula R&D and the Reformulation Optimizer can now retrieve read-only,
tenant-scoped aggregate sensory evidence for an immutable formula version.
The evidence service only uses decided trials, never changes a trial, formula,
inventory movement, or approval state, and reports `Not enough evidence` until
three completed overall scorecards are available.

The projection is capability-gated by `formulas.viewSensitive`,
`materials.view`, and `trials.view`. It returns only aggregate scores, sample
count, confidence, and a safe status; it excludes observations, evaluator
identity, public-link tokens, material composition, lots, costs, and internal
comments. Trial reviewers without sensitive formula access receive
`Not available for this role` rather than a partially redacted result.

### Phase 6-9: Private Learning, Traceability, And Controlled Optimization

**Private sensory memory** derives a versioned workspace preference profile
only from decided tenant Trials. It is descriptive evidence, never model
training, an odor prediction, or a change to an existing formula. The profile
needs a minimum evidence threshold and its direction-ranking adjustment is
bounded; missing evidence remains `Not enough evidence`.

**Operational lineage** is a bounded, tenant-scoped read projection over the
existing formula version, trial, lot, batch, finished-good, order, and document
records. It adds no second graph database and never rewrites historical
operational records. Formula R&D shows a compact trace summary when the role
has sensitive formula, material, and Trial access.

**Reformulation Optimizer** now accepts explicit hard constraints: preserve or
prohibit materials, required eligible inventory, cost-reduction target, cost
ceiling, and evidence preferences. It can only use reviewer-approved material
substitutions. Candidates are ranked lexically by compliance, evaluated
inventory, visible cost, and minimum composition change, with a Pareto state
that is `Not evaluated` whenever commercial evidence is unavailable.
Cost objectives require `costing.view`; an eligible-inventory hard gate requires
`inventory.view`, and any candidate that fails an explicit gate is not offered
for draft confirmation.

### Luồng Reformulation Optimizer

Optimizer dùng workflow `Baseline → Objectives → Analyze → Draft`. Người dùng
chọn một immutable formula version; version có nested accord được phân giải về
raw-material leaves trước khi phân tích, không chỉnh sửa snapshot gốc. Khi chưa
có substitution đã được reviewer phê duyệt, engine vẫn có thể đề xuất thay đổi
tỷ lệ giữa các material sẵn có trong baseline nhưng không tự đưa material mới
vào công thức.

Ba guardrail material được tách rõ: **Lock exact percentages** giữ nguyên tỷ lệ,
**Preserve materials** giữ material nhưng cho phép đổi tỷ lệ, và **Exclude
materials** chỉ được giải quyết bằng substitution đã duyệt. Kết quả hiển thị
baseline/candidate/delta theo từng material, compliance, inventory, cost và
Pareto evidence theo quyền. Artifact từ Worker/D1 hoặc local API được khôi phục
qua cùng một envelope; đổi formula/version sẽ xóa candidate cũ để không hiển thị
kết quả sai baseline. Candidate không thay đổi thành phần bị coi là reference và
backend từ chối tạo draft trùng. Mọi run và draft vẫn không reserve hoặc consume
inventory.

The tenant feature flags `designStudioCandidateGeneration`,
`designStudioOptimizer`, `designStudioSensoryMemory`, and
`formulaIntelligenceRag` are server-side kill switches. They change runtime
behavior in both local API and Worker paths; frontend visibility is only a
reflection of those capabilities.

Migration `0037_competitive_moat_memory.sql` adds tenant-scoped durable
records for sensory memory, immutable preference-profile history, and approved
material substitutions. Apply it to D1 before deploying the Worker.
The isolated local test D1 binding has applied migrations through `0037`
successfully; the production-named local binding remains blocked earlier by
pre-existing migration `0010` schema drift and was deliberately left unchanged.

Checkpoint Competitive Moat tạo lineage riêng tư cho Design Studio theo luồng:
**raw brief -> structured review -> immutable brief version -> direction generation**.
`formula_design_projects` vẫn là project aggregate hiện có; migration
`0036_competitive_moat_briefs.sql` bổ sung brief version, constraint snapshot,
generation context và direction evaluation mà không tạo song song một AI
architecture mới.

- Project mới chỉ lưu raw brief VI/EN. User với quyền `formulas.edit` phải
  review các ràng buộc có cấu trúc trước khi Generate.
- Khi chưa có provider, Brief Compiler trả `Not configured`. Hệ thống không tự
  suy diễn market, IFRA, budget, material hay compliance; thiếu trường quan
  trọng sẽ được lưu thành `REVIEW_REQUIRED`.
- Project cũ được backfill thành `LEGACY_UNSTRUCTURED`; brief JSON cũ vẫn hoạt
  động để không phá vỡ generation workflow đã tồn tại.
- Mọi mutation vẫn qua authenticated tenant context, CSRF, idempotency và audit
  evidence. Công thức, compliance, inventory và Trial/Sensory không thay đổi
  behavior trong checkpoint này.

Tài liệu baseline, data flow, risk register, backlog và execution state nằm
trong [docs/competitive-moat](docs/competitive-moat/).

### Phase 3: Candidate lineage

Mỗi lần Generate từ một structured brief đã review, hệ thống pin một material
universe tenant-scoped (eligible material, family, tier và availability rank)
vào constraint snapshot bằng SHA-256. Ba direction deterministic được đánh giá
theo formula math, required-material constraint, compliance, availability và
cost khi role được phép xem. Evaluation chỉ trả về cho perfumer tạo direction;
brand projection vẫn không chứa material ID, ratio, cost, lot hoặc warning thô.
Không có stock reservation, consumption hoặc provider/LLM call trong bước này.

OlfactoryOps là hệ điều hành đa tenant cho nghiên cứu, phát triển và vận hành thương mại ngành hương liệu. Hệ thống kết nối Material Intelligence, công thức, tồn kho theo lot, sản xuất, mua hàng, thương mại, đơn hàng, bằng chứng tuân thủ và phân tích vận hành trong một workspace.

## Công nghệ sử dụng

- Frontend React 19 + Vite
- NestJS/Fastify API cục bộ cho development
- Cloudflare Workers API + D1 cho beta và môi trường hosted
- Vitest cho domain test và Playwright cho functional test

## Kiến trúc hệ thống

OlfactoryOps là ứng dụng React chạy trên trình duyệt với hai API target. NestJS/Fastify phục vụ development và deterministic local test. Cloudflare Worker là ranh giới API cho beta/production, chịu trách nhiệm authentication, authorization, tenant isolation, persistence, audit và Cloudflare binding.

~~~mermaid
flowchart LR
  Browser["Trình duyệt<br/>React 19 + Vite"]
  Pages["Cloudflare Pages<br/>website, login, workspace SPA"]
  LocalApi["API cục bộ<br/>NestJS + Fastify<br/>chỉ dùng cho development"]
  Worker["Cloudflare Worker<br/>/api/v1<br/>auth, policy, domain service"]
  D1[("Cloudflare D1<br/>dữ liệu theo tenant<br/>audit, ledger, job")]
  KV[("Workers KV riêng tư<br/>payload SDS/CoA")]
  AI["Workers AI<br/>LLM planning, embedding và text extraction"]
  Vectorize[("Vectorize<br/>material evidence vector")]
  Providers["Provider tuỳ chọn<br/>Resend, Stripe, Cloudflare for SaaS"]

  Browser --> Pages
  Browser -->|"local: /api/v1"| LocalApi
  Browser -->|"beta/prod: /api/v1"| Worker
  Worker --> D1
  Worker --> KV
  Worker --> AI
  Worker --> Vectorize
  Worker --> Providers
~~~

### Frontend

- <code>src/</code> chứa React 19 + TypeScript application do Vite build: public product site, authentication, role-aware navigation, Materials, Formulas, Inventory, Production, Commerce, Analytics, Formula Intelligence và Trials & Sensory.
- API client tập trung ở <code>src/App.tsx</code>. Browser gửi request kèm credential, thêm CSRF token cho mutation và coi API là source of truth.
- <code>VITE_API_BASE_URL</code> chọn API target. Chỉ đặt public API URL vào biến này; mọi biến có tiền tố <code>VITE_</code> đều nằm trong client bundle và không được chứa secret.
- CORS credential chỉ allow exact origin. Worker production hiện cho phép domain chính, Pages test (<code>test.labofscents.pages.dev</code>), Pages beta và <code>beta.labofscents.org</code>; không dùng wildcard Pages origin.
- Frontend không phải lớp tin cậy để cấp quyền, tính compliance cuối cùng, cập nhật inventory hoặc ghi audit. UI chỉ hiển thị capability phù hợp; backend kiểm tra lại mọi quyết định bảo mật.

### Motion và tương tác

- Quiet Lab motion nằm ở <code>src/ui/motion/</code>, là React/TypeScript source cục bộ dựa trên <code>framer-motion</code>. Không tải React Bits package, Pro registry hoặc remote runtime.
- <code>AnimatedContent</code>, <code>AnimatedList</code>, <code>MotionCardButton</code>, <code>Stepper</code> và <code>CountUp</code> hỗ trợ đọc dữ liệu, tiến trình workflow và decision card trên Home, Formula Design Studio, Trials & Sensory và Production lifecycle.
- Motion chỉ kéo dài 160--220 ms, không autoplay, không chứa thông tin bắt buộc và tôn trọng cả <code>prefers-reduced-motion</code> lẫn thiết lập workspace <code>Reduce motion</code>.

### Backend

- <code>server/</code> là NestJS/Fastify API cho development và test. Nó chỉ bind ở <code>127.0.0.1</code> và từ chối production hoặc non-loopback configuration.
- <code>worker/index.ts</code> là Cloudflare API hosted. Nó cung cấp <code>/api/v1</code>, áp dụng request-size limit, CORS, rate limit, opaque-session authentication, CSRF validation, permission check, tenant scope, idempotency và audit persistence.
- <code>server/src/services/northstar.service.ts</code> chứa deterministic domain rule dùng chung: formula resolution, IFRA, inventory movement, FEFO, production release, costing, approval và role permission.
- Background work bền vững chạy trên D1 và Worker cron: Formula Agent job, notification/outbox retry, Material Evidence indexing và supplier catalogue import. Lease token cùng retry có giới hạn giúp tránh xử lý lặp sau gián đoạn.

### Database và storage

- Cloudflare D1 là system of record cho môi trường hosted. Mọi operational record được scope theo <code>organization_id</code>; migration trong <code>migrations/</code> phải chạy trước Worker dùng schema mới.
- D1 lưu user, session, tenant setting, material, formula, formula version, inventory lot, immutable movement ledger, production/receipt/QC, commerce, approval, audit chain, notification, idempotency, agent state và RAG indexing metadata.
- Material Intelligence dùng hai scope rõ ràng. Bản ghi <code>GLOBAL</code> là thư viện OlfactoryOps dùng chung, không có <code>organization_id</code> và tenant khách hàng chỉ được đọc. Admin/Owner/Manager thuộc workspace curator hệ thống khi tạo hoặc import material sẽ publish <code>GLOBAL</code> cho mọi tenant. Material do bất kỳ role nào trong workspace khách hàng tạo/import luôn là <code>TENANT</code>, bắt buộc có <code>organization_id</code> và không xuất hiện ở workspace khác; yêu cầu tự nâng scope lên global bị server từ chối. Compliance, document, lot, cost và inventory của khách hàng vẫn luôn tenant-scoped.
- Payload SDS/CoA riêng tư dùng binding <code>DOCUMENTS</code> của Workers KV trong beta. D1 chỉ lưu document metadata, scan/review status, ownership, version và access evidence. Signed download URL không được dùng làm RAG source.
- Material Evidence RAG chỉ lưu vector reference, excerpt giới hạn, content hash, review state và job metadata trong D1. Workers AI tạo embedding, Vectorize lưu vector theo tenant namespace; D1 kiểm tra lại tenant scope, approval, version, checksum và permission sau mỗi kết quả.

### Nhập supplier catalogue

- Lluch Essence Product List 2026 đã được nhập gồm 1.986 supplier product thuộc bốn nhóm: synthetic aroma chemical, natural aroma chemical, natural product và organic product. PDF nguồn có version <code>2026-07-16</code>, SHA-256 <code>ff6642fcec15f3505470710eca8452fd70d296f9a94a68f074dfe6f9201014a4</code>.
- Migration <code>0035_lluch_supplier_catalogue.sql</code> giữ import evidence tương thích theo tenant. Projection Materials hiện dùng một catalogue Lluch global, deterministic và read-only để mọi workspace đọc cùng dữ liệu mà không nhân bản material master.
- Toàn bộ 1.986 sản phẩm Lluch hiện xuất hiện trực tiếp trong **Materials**, không có catalogue workspace riêng. Có thể tìm bằng product name, CAS, EINECS, FEMA hoặc supplier; hàng catalogue có nhãn **Needs review** và liên kết về supplier/category/page.
- Hàng Lluch source-only có thể được khám phá và chọn để bổ sung dữ liệu, nhưng không xuất hiện trong Inventory khi chưa có lot. Snapshot Lluch Platform do NOX Lab trích xuất đã bổ sung supplier-declared odour, appearance, chemical identification và declared use cho toàn bộ 1.986 dòng; 1.646 dòng có thêm density range. Đây là evidence supplier hiển thị trực tiếp trong **Materials**, không phải chứng nhận kỹ thuật đã phê duyệt.
- 11 profile biên tập NOX Lab được nối bằng exact CAS, gồm descriptor, strength, diffusion, tenacity, volatility và formula role. Các profile này chỉ là sensory guidance; chúng không tạo IFRA limit, allergen declaration, EU/UK regulatory flag, commercial cost, molecular weight, LogP hoặc vapor pressure. Khi supplier không công bố một trường, UI hiển thị `Not documented`, không thay bằng `0` hoặc giá trị suy diễn.
- Toàn bộ 1.986 dòng là **global master reference** read-only: không thuộc tenant, dùng chung trong Materials, có thể được index vào Vectorize như supplier evidence và được truy xuất bởi RAG/Agent trong bước research. Indexing chạy bằng D1 job lease + retry; `SOURCE_ONLY` vẫn giữ nguyên cho tới khi platform curator review evidence chính thức.
- Compliance vẫn tách riêng và bắt buộc evidence-controlled: source-only material không thể vào Inventory, procurement, approved formula, Optimizer hoặc formula draft. Formula Agent và Design Studio có thể dùng catalogue profile/citation để discovery, nhưng chỉ material đã được review/approved mới được dùng làm thành phần có thể lưu; chứng từ IFRA/SDS/CoA/allergen hợp lệ vẫn phải được review độc lập.

### Authentication và authorization

1. Người dùng đăng ký hoặc đăng nhập qua <code>/api/v1/auth/*</code>.
2. Worker tạo opaque session credential đã one-way hash và gửi bằng secure HTTP-only cookie. Browser JavaScript không nhận session secret.
3. Audit session ID được tạo bằng cryptographic randomness, không dùng sequence theo số session đã hydrate; đăng nhập mới không thể ghi đè session lịch sử trong D1.
4. Khi đổi seeded admin email, Worker canonicalize credential đúng một lần và xóa credential legacy sau khi canonical credential đã được lưu. Chỉ password hash thực sự thay đổi mới revoke session admin.
5. <code>/api/v1/me</code> khôi phục session, workspace context, effective role permission và CSRF token.
6. Cookie-authenticated mutation cần <code>X-CSRF-Token</code>; route nhạy cảm có rate limit riêng. Opaque bearer credential chỉ được hỗ trợ rõ ràng cho non-browser tooling.
7. Mỗi request được xác thực, scope vào active organization, kiểm tra permission matrix và ghi audit evidence khi thay đổi controlled state.

Authentication không cấp quyền cross-tenant. Owner/Admin vẫn bị giới hạn theo permission: audit evidence được xem khi phù hợp, nhưng agent payload, document, cost, lot và formula composition riêng tư vẫn có capability gate độc lập.

### Topology triển khai

- **Local development:** Vite phục vụ browser tại <code>127.0.0.1:5173</code>; NestJS/Fastify phục vụ <code>/api/v1</code> tại <code>127.0.0.1:4000</code>.
- **Beta:** Cloudflare Pages phục vụ <code>test.labofscents.pages.dev</code>; Worker <code>olfactoryops-api-test</code> dùng D1 <code>olfactoryops-test</code> tách biệt, test KV namespace riêng tư và Vectorize index <code>olfactoryops-material-evidence-test</code>.
- **Production:** Cloudflare Pages phục vụ public/workspace frontend; Worker <code>olfactoryops-api</code> dùng D1 và Vectorize index production. Production binding, custom domain và provider secret được cấu hình trong Cloudflare, không commit vào Git hoặc đưa ra frontend.
- <code>wrangler.test.toml</code> là cấu hình test; <code>wrangler.toml</code> là production binding. Luôn chạy migration trên đúng D1 database trước khi deploy Worker.

### Vệ sinh dữ liệu môi trường

- Tại checkpoint ngày 02/08/2026, D1 test và production chỉ giữ workspace owner <code>org-nxl</code>. Các tenant signup/demo/QA tự động, dữ liệu tenant-scoped, credential mồ côi, rate-limit tạm và snapshot legacy đã được xóa sau khi xác nhận normalized-state cutover hoàn tất.
- Việc xóa tenant phải lấy D1 Time Travel bookmark trước, xóa từ <code>tenant_organizations</code> để kích hoạt cascade, rồi kiểm tra toàn bộ bảng có <code>organization_id</code> không còn dữ liệu ngoài owner. Không xóa global material/evidence thuộc <code>org-nxl</code> và không commit bookmark phục hồi vào Git.
- QA tenant chỉ được tạo trong D1 test, phải dùng tên/email nhận diện tự động và được dọn sau checkpoint. Production không được dùng cho signup, billing hoặc formula smoke test tự động.

### Signup multi-tenant và Cloudflare for SaaS

`POST /api/v1/auth/signup` tạo atomically tenant D1, brand mặc định, Owner,
credential hash, policy tối thiểu và system hostname `slug.labofscents.org`.
`workspace_hostnames` là registry duy nhất cho hostname: slug reserved/collision
bị từ chối trước khi ghi. Response trả `systemHostname` và `workspaceUrl`; UI
chỉ redirect đến HTTPS hostname hợp lệ dưới `labofscents.org`.

System hostname không dùng Cloudflare for SaaS, không cần DCV và không được
khai báo lại như customer domain. `tenant-app-router` Worker nhận wildcard
system hostname, kiểm tra mapping `SYSTEM/ACTIVE` cùng tenant active trong D1
rồi proxy Pages. Hostname unknown, archived hoặc không hợp lệ trả `404` không
cache. CORS credentialed chỉ được cấp cho exact HTTPS origin có mapping active;
session tenant mở trên hostname tenant khác bị Worker từ chối an toàn và client
redirect về workspace đúng.

Sau signup, Owner chọn **Connect a domain** trong `Workspace access`, nhập
hostname mà họ sở hữu ngoài `labofscents.org`, và Worker mới gọi Cloudflare Custom Hostnames. Trạng thái
được giữ tenant-scoped: `pending_validation -> active | failed`. UI hiển thị
TXT/DCV Cloudflare trả về; chỉ khi provider **và** SSL đều `active` thì
`tenant_organizations.custom_domain` mới được cập nhật. Retry/Refresh là
idempotent và hostname không thể thuộc hai tenant.

Cloudflare Dashboard bật SaaS chưa đủ để Worker provision. Mỗi môi trường cần
secret Worker riêng, không đưa giá trị vào Git, frontend hay chat:

~~~powershell
npx.cmd wrangler secret put CLOUDFLARE_API_TOKEN --config wrangler.test.toml
npx.cmd wrangler secret put CLOUDFLARE_SAAS_ZONE_ID --config wrangler.test.toml
npx.cmd wrangler secret put CLOUDFLARE_SAAS_ORIGIN --config wrangler.test.toml
~~~

Token chỉ cần quyền Zone `SSL and Certificates: Write` cho zone SaaS. Lặp lại
không có `--config` khi cấu hình Worker production. `CLOUDFLARE_SAAS_ORIGIN`
là **hostname origin** của Pages/app (ví dụ `test.labofscents.pages.dev`), không
phải URL có `https://` và không phải hostname khách hàng. Integration
Readiness sẽ báo `Not configured` đến khi đủ secret; đây là trạng thái an toàn,
không phải kết quả provision giả.

Triển khai system hostname production cần migration `0043_workspace_hostnames.sql`,
deploy `olfactoryops-tenant-router`, DNS wildcard proxied `*.labofscents.org`
và route `*.labofscents.org/*`. API cần route cụ thể
`api.labofscents.org/* -> olfactoryops-api` đồng thời giữ custom-domain exact;
route Worker wildcard chạy trước Custom Domain nên đây là lớp loại trừ bắt buộc.
Các hostname `beta`, `www`, `customers`, `saas-origin` và `saas-origin-beta`
phải có no-worker exclusion cụ thể để không bị wildcard router bắt. Chi tiết
thao tác ở `docs/deployment.md`.

Smoke signup có mutation bị chặn mặc định để không sinh tenant QA trên production.
Chỉ chạy trong D1 test với `ALLOW_SIGNUP_TENANT_TEST=true`,
`SIGNUP_TEST_API_URL` và `SIGNUP_TEST_APP_URL`; smoke xác minh
`systemHostname/workspaceUrl` và managed beta, không provision customer domain.

Pages PWA dùng cache shell có version. Mỗi checkpoint thay đổi cache revision và
Worker mới gọi `skipWaiting`/`clients.claim`; chỉ tab đang được service worker cũ
điều khiển mới reload một lần khi phiên bản mới nhận quyền. Lượt truy cập đầu tiên
không bị reload. Cách này tránh giữ UI signup hoặc policy cũ sau deploy mà vẫn chỉ
dùng cache shell làm offline fallback.

Các JavaScript và CSS do Vite tạo trong `/assets/` luôn có content hash. Pages đặt
`Cache-Control: public, max-age=31536000, immutable` riêng cho các asset này, còn
HTML, API và session response vẫn không cache. QR label generator có lazy chunk
riêng và chỉ tải khi người dùng thực sự in nhãn, không nằm trong bundle khởi động.

### Luồng dữ liệu

**Operational mutation**

~~~mermaid
sequenceDiagram
  participant UI as React workspace
  participant API as Worker API
  participant Domain as Deterministic domain service
  participant DB as D1
  participant Audit as Audit chain

  UI->>API: Mutation + CSRF + Idempotency-Key
  API->>API: Auth, tenant scope, permission, rate limit
  API->>Domain: Kiểm tra business rule
  Domain->>DB: Ghi atomic record, ledger, idempotency
  Domain->>Audit: Ghi append-only audit evidence
  API-->>UI: Persisted response hoặc idempotent response gốc
~~~

**Document evidence và RAG**

~~~mermaid
sequenceDiagram
  participant Manager as documents.manage user
  participant API as Worker API
  participant KV as Private KV
  participant DB as D1
  participant AI as Workers AI
  participant V as Vectorize

  Manager->>API: Upload PDF text sạch đã duyệt
  API->>KV: Lưu private payload
  API->>DB: Lưu document metadata và review state
  Manager->>API: Queue extraction, rồi review text
  API->>AI: Extract text và tạo embedding
  API->>V: Upsert vector theo tenant
  API->>DB: Lưu chunk, version/hash, status, audit
  API-->>Manager: Citation giới hạn có source/version/excerpt
~~~

**Từ formula đến fulfillment**

~~~mermaid
flowchart LR
  Draft["Formula draft"] --> Review["Review và approve version"]
  Review --> Batch["Production batch + QC"]
  Batch --> FinishedLot["Released finished-good lot"]
  FinishedLot --> SKU["SKU / catalogue"]
  SKU --> Quote["Quote và multi-SKU order"]
  Quote --> Reserve["FEFO reservation"]
  Reserve --> Fulfill["Fulfillment và COGS"]
  Fulfill --> Ledger["Inventory và audit ledger bất biến"]
~~~

Formula design, simulation, review và approval không tiêu hao inventory. Inventory chỉ thay đổi khi committed lab usage, receipt, reservation, fulfillment, production consumption hoặc compensating reversal ghi vào ledger.

**Trials và sensory memory**

~~~mermaid
flowchart LR
  Version["Approved immutable formula version"] --> Trial["Planned trial"]
  Trial --> Release["Trial release gate"]
  Release --> Weigh["Committed Lab Usage"]
  Weigh --> Ledger["FEFO lot và immutable OUT movement"]
  Weigh --> Session["Blind hoặc brand-review sensory session"]
  Session --> Scores["Scorecard opening đến overall có cấu trúc"]
  Scores --> Decision["Accept, revise hoặc reject có rationale"]
  Decision --> Evidence["Comparable evidence riêng tư theo tenant"]
~~~

<code>/trials</code> là Workbench workflow tạo vòng lặp học tập có kiểm soát. Trial lưu approved formula-version checksum và release evidence nhưng không tự di chuyển material. Chỉ Lab Usage commit mới liên kết actual weight, FEFO allocation, movement ID và lot-cost snapshot vào released trial. <code>SENSORY_PANELIST</code> nội bộ chỉ nhận scorecard đã blind. Public link là opaque, hashed, rate-limited, revocable và chỉ hiển thị sample code hoặc brand narrative/pyramid đã được duyệt. Comparable evidence ở trong tenant gốc và trả <code>Not enough evidence</code> khi chưa đủ ba scorecard hoàn thành.

## Yêu cầu môi trường

- Node.js 22 trở lên
- npm 10 trở lên
- Cloudflare account và Wrangler authentication chỉ khi deploy Worker/D1

## Khởi động nhanh

Cài dependency:

~~~bash
npm ci
~~~

Chạy local API ở một terminal:

~~~bash
npm run dev:api
~~~

Chạy frontend ở terminal khác:

~~~bash
npm run dev
~~~

Mở <code>http://127.0.0.1:5173</code>. Vite app mặc định gọi local API tại <code>http://127.0.0.1:4000/api/v1</code>.

Để trỏ frontend sang API khác, tạo file <code>.env.local</code> đang được Git ignore:

~~~bash
VITE_API_BASE_URL=https://your-api-host.example/api/v1
~~~

Không đặt password, Cloudflare secret hoặc production credential vào biến <code>VITE_</code>; các giá trị này được bundle vào browser code.

## Đăng nhập và sample data

Development service có seeded administrator:

- Email: <code>m.thuanwork@gmail.com</code>
- Password: cấu hình bằng password-hash helper bên dưới; source control không lưu default password.

Tạo password verifier tương tác:

~~~bash
npm run security:hash-admin-password
~~~

Với local Nest API, đặt verifier vừa tạo trong PowerShell session trước khi chạy API:

~~~powershell
$env:SEEDED_ADMIN_PASSWORD_HASH = 'pbkdf2:v1:sha256:...'
npm run dev:api
~~~

Với Cloudflare, lưu verifier vừa tạo thành Worker secret <code>SEEDED_ADMIN_PASSWORD_HASH</code> qua Wrangler. Seeded workspace có material, lot, formula, production batch, SKU, customer, quote, order, audit event và analytics record đại diện để các luồng chính dùng được ngay.

## Các lệnh hữu ích

~~~bash
# Build và type-check frontend
npm run build

# Build Nest API
npm run build:api

# Chạy domain test
npm run test

# Chạy toàn bộ deploy-time check
npm run deploy:check

# Chạy Cloudflare Worker với local D1
npm run dev:worker

# Áp D1 migration tại local
npm run d1:migrate:local

# Chạy functional và Formula live check (cần credential trong environment)
npm run test:functional:report
npm run test:formula:live
~~~

## Triển khai Cloudflare

Kiến trúc hosted dùng Cloudflare Pages cho frontend và Cloudflare Workers + D1 cho API/dữ liệu.

1. Authenticate Cloudflare và tạo D1 database.
2. Sao chép D1 database ID vào <code>wrangler.toml</code>.
3. Chạy migration bằng <code>npm run d1:migrate:remote</code>.
4. Lưu <code>SEEDED_ADMIN_PASSWORD_HASH</code> thành Worker secret.
5. Deploy API bằng <code>npm run deploy:worker</code>.
6. Thiết lập Pages build command <code>npm ci && npm run build</code>, output directory <code>dist</code>, và <code>VITE_API_BASE_URL</code> trỏ tới API đã deploy.

Production checklist, security requirement, custom domain guidance và live test command được mô tả trong [docs/deployment.md](docs/deployment.md).

### Enterprise release gate

- Chạy D1 migration trước khi deploy Worker. <code>0025_enterprise_persistence_audit_chain.sql</code> hoàn tất normalized-state cutover và thêm append-only audit-chain evidence. <code>0026_finished_goods_operational_trace.sql</code> thêm finished-good lot, finished-good ledger/COGS, formula SKU support và organization scope cho commerce record.
- <code>0027_operational_p1_enterprise.sql</code> thêm tenant-scoped material compliance, approved supplier offer, receipt/inspection/RMA quarantine, immutable landed-cost allocation, QC specification/result, yield reconciliation và operation idempotency record. Phải áp migration này trước Worker mở Operational P1 route.
- <code>0028_auth_session_credentials.sql</code> thay legacy session-ID credential bằng opaque one-way-hashed Worker credential và revoke pre-migration session. User phải đăng nhập lại sau migration.
- <code>0033_material_evidence_rag.sql</code> thêm reviewed evidence source, citation chunk có giới hạn và lease-fenced indexing job theo tenant. RAG v2 dùng Vectorize cosine 1.024 chiều riêng cho test/production; binding <code>AI</code> và <code>RAG_INDEX</code> có metadata index cho <code>organizationId</code>, <code>status</code>, <code>materialId</code>, <code>documentId</code>, <code>sourceKind</code> và <code>indexVersion</code>.
- <code>0035_lluch_supplier_catalogue.sql</code> nhập Lluch Essence Product List 1.986 dòng vào supplier-catalogue table theo tenant trong D1. Áp migration trước Worker; scheduled run đầu tiên hoặc authorized **Sync catalogue** sẽ nhập idempotent cho từng workspace.
- <code>0038_sales_order_details.sql</code> bổ sung contact, địa chỉ giao hàng snapshot, customer reference, delivery instruction và bằng chứng hủy đơn cho Sales Order. Áp migration này trước khi deploy route update/cancel Orders.
- <code>0039_global_material_library.sql</code> bổ sung <code>library_scope</code> và <code>organization_id</code> cho material master. Migration backfill bản ghi cũ có ownership trong JSON thành <code>TENANT</code>; các seed/catalogue record không có owner trở thành <code>GLOBAL</code>. Worker luôn ghi hai cột này cùng JSON và từ chối tenant sửa metadata global.
- <code>0043_workspace_hostnames.sql</code> thêm hostname registry tenant-scoped. System hostname có dạng <code>&lt;slug&gt;.labofscents.org</code>, active ngay sau signup; custom hostname chỉ active sau Cloudflare provider và SSL xác nhận. Áp migration này trước API/router deploy.
- Production batch chỉ tạo finished-good lot khi formula input approved, raw-material consumption đầy đủ, QC pass và release. Formula SKU reserve released finished-good lot bằng FEFO và chỉ ghi COGS khi fulfilled.
- <code>GET /api/v1/audit/chain/verify</code> và <code>GET /api/v1/audit/chain/evidence</code> là evidence endpoint chỉ dành cho Owner/Admin và không bao giờ trả provider secret.
- Beta integration luôn trung thực: Integration Readiness trả <code>Not configured</code> cho đến khi Worker secret và phụ thuộc DNS/HTTPS thật sự active. <code>managed_beta</code> tiếp tục từ chối toàn bộ Stripe customer-payment mutation ở server.

Với Worker beta tách biệt, dùng rõ test configuration:

~~~bash
npx wrangler d1 migrations apply olfactoryops-test --remote --config wrangler.test.toml
npm run deploy:worker -- --config wrangler.test.toml
npm run deploy:pages:test
~~~

Không deploy Worker khi remote D1 migration chưa thành công. <code>beta.labofscents.org</code> được cấu hình làm hostname health-check của Worker production. Nó vẫn là external DNS/Pages custom-domain gate: Pages preview thành công không chứng minh hostname đã resolve hoặc có HTTPS certificate hợp lệ. Integration Readiness sẽ báo <code>Blocked</code> cho đến khi Cloudflare Pages xác nhận custom domain và HTTPS thực sự hoạt động.

### Operational P1 workflow

1. Owner hoặc Admin tạo material compliance profile với IFRA category limit, EU/UK flag, source, version, review date và disposition. Material <code>BLOCKED</code> không thể mua hoặc consume. Material <code>REVIEW_REQUIRED</code> chỉ có thể vào receiving quarantine.
2. Purchase order ở trạng thái sent tạo goods receipt. Mỗi receipt line tạo lot <code>QUARANTINE</code> và movement <code>RECEIPT</code>; chưa đủ điều kiện FEFO hoặc production.
3. Ghi freight, duty và insurance trước khi accept receipt. Service phân bổ theo extended line value, đưa rounding residual vào dòng có giá trị cao nhất và lưu landed unit cost bất biến trên lot.
4. Owner, Admin, Lab Manager hoặc Manager inspect receipt. Accept đưa lot vào available inventory; return-to-supplier ghi immutable return movement. Discrepancy mở sẽ chặn acceptance.
5. Tạo formula-specific release QC template trước P1 batch. Operator ghi structured result; Admin hoặc Manager approve QC không cần MFA. Cần reconcile yield, waste, labor và overhead trước release; release tạo private Batch CoA ở review state và finished-good lot có audit.

P1 route yêu cầu <code>Idempotency-Key</code> cho mutation tại Worker. Retry cùng request trả response đã persist thay vì lặp receipt, landed-cost posting, QC approval, yield record hoặc lifecycle mutation.

## Ghi chú về dữ liệu và bảo mật

- Tenant access, session, permission và audit event đều được server enforce.
- Worker cookie mang opaque session credential, không mang audit session ID hiển thị. Cookie-authenticated API mutation cần CSRF token; opaque bearer credential chỉ dành cho non-browser tooling.
- Local Nest/Fastify API chỉ dùng cho development/test và bind ở <code>127.0.0.1</code>. Nó từ chối production runtime và <code>HOST</code> không phải loopback.
- D1 lưu operational metadata có cấu trúc; SDS/CoA binary beta ở private Cloudflare Workers KV namespace, document metadata và signed-access evidence ở D1.
- Material Evidence RAG là evidence-first: chỉ document approved, clean và PDF có text đã review mới được index. Thiếu Workers AI hoặc Vectorize binding sẽ trả <code>Not configured</code>, không tạo evidence giả. Setup/access rule nằm tại [docs/material-evidence-rag.md](docs/material-evidence-rag.md).
- Functional report, browser evidence, <code>.env*</code> file và credential được Git ignore có chủ đích.

## Production integration

Provider secret chỉ nằm ở Cloudflare Worker. Không có <code>STRIPE_*</code>, <code>RESEND_*</code>, <code>CLOUDFLARE_*</code>, password hoặc provider token nào được dùng tiền tố <code>VITE_</code>.

- **Beta access:** <code>BILLING_MODE=managed_beta</code> là mặc định. Customer API và UI chỉ hiển thị <strong>Beta access</strong>; không trả gói, giá, invoice, provider ID, checkout, portal hoặc plan-change. Các tính năng workspace đã bật vẫn cho member thử nghiệm, trong khi capacity, write gate và tenant permission tiếp tục được enforce ở server. Chỉ chuyển sang <code>self_service</code> sau khi Stripe credential, price ID và webhook validation đã cấu hình.
- **Workspace members:** Owner/Admin xem danh sách thành viên tenant thực từ <code>/security/tenant-console</code>, gồm email, role, trạng thái và số seat đang dùng. Khi ở <code>managed_beta</code>, giao diện ghi rõ <strong>Managed beta access</strong> thay vì hiển thị gói thanh toán hoặc checkout; quản lý invite/role/session vẫn nằm trong <strong>Members & security</strong>.
- **Integration readiness:** Workspace access dùng grid ngắn gọn, chỉ hiển thị integration, trạng thái và hành động tiếp theo. Provider detail đầy đủ tiếp tục nằm ở server audit/readiness API, không chiếm giao diện vận hành.
- **Production lifecycle:** Batch Board mở đúng Lifecycle Gate của batch đã chọn và tự đưa người dùng đến next action. Structured QC chỉ cho Owner/Admin/Manager/Lab Manager duyệt khi toàn bộ check bắt buộc đã pass; Worker xác minh lại role, tenant scope và release gate trước khi chuyển batch sang bottling.
- **Transactional email:** in-app notification outbox được persist trong D1, gửi invite, new-device security, billing và privacy-request qua Resend khi có <code>RESEND_API_KEY</code> và <code>EMAIL_FROM</code>. Lỗi retry bằng bounded backoff và không rollback business mutation.
- **Cloudflare for SaaS:** Owner/Admin chỉ provision hoặc refresh customer hostname khi Cloudflare API token, SaaS zone ID và optional custom origin đã cấu hình. Workspace hostname chỉ thay đổi khi Cloudflare trả hostname và SSL active; DCV/provider error vẫn hiển thị khi pending.
- **Import CSV/XLSX:** Material Library nhận CSV/XLSX cho material và inventory lot, cho phép mapping cột, dry-run có row-level error và chỉ commit validated idempotent job. Lot có thể khớp material theo ID, CAS hoặc name.
- **PWA và QR:** Production build đăng ký privacy-safe app-shell service worker; API response không cache. Inventory quét QR lot qua browser camera và chỉ chọn lot trong workspace hiện tại.
- **Notification và legal:** Member inbox hỗ trợ invitation, security, billing, low-stock và expiry. Password-reset token one-time/hash; legal consent có version; member tải scoped JSON personal-data export hoặc yêu cầu erasure review.
- **Observability và ngôn ngữ:** <code>GET /api/v1/status</code> báo D1 và số slow/error event gần đây. Optional Sentry chỉ nhận route, status, duration cho Worker 5xx. Tenant locale hỗ trợ English/Vietnamese ở shell, navigation, authentication và notification; dữ liệu hương liệu kỹ thuật giữ language-neutral.
- Cửa sổ health 15 phút chuẩn hóa timestamp ISO qua <code>julianday()</code>, vì vậy lỗi cron cũ không giữ API ở trạng thái <code>degraded</code> sau khi đã hết thời gian quan sát.

Public status page tại <code>/status.html</code> trên test Pages, Vercel beta hoặc production frontend host. Trang chỉ poll public health endpoint và không lộ workspace data.

## Cấu trúc dự án

~~~text
src/                    Ứng dụng React và domain model
server/                 NestJS API cho development local
worker/                 Cloudflare Worker và D1 persistence adapter
migrations/             D1 schema migration
scripts/                Security, functional test và utility script
docs/                   Tài liệu deploy và sản phẩm
~~~

## Trước khi tạo Pull Request hoặc deploy

~~~bash
npm run build
npm run build:api
npm run test
npm run security:client-bundle
~~~

## Nền tảng AI/Agent

Môi trường Cloudflare dùng <code>AGENT_PROVIDER=workers_ai</code> với model mặc định <code>@cf/openai/gpt-oss-120b</code>. Workers AI chỉ tạo research plan có schema: tóm tắt brief, search query, note focus/avoid và danh sách tool đọc được phép. Output của model phải qua Zod validation; tool không đăng ký, payload quá giới hạn hoặc response không đúng schema sẽ bị từ chối.

Formula Agent, Design Studio và Reformulation Optimizer dùng research plan này để truy xuất material/evidence phù hợp. Formula math, IFRA/compliance, inventory, cost, ranking cuối cùng và save draft vẫn do deterministic domain services thực hiện. LLM không chạy SQL, không truy cập URL tuỳ ý, không tự ghi formula, không reserve/consume inventory và không bỏ qua confirmation.

Local/CI không có Workers AI binding sẽ giữ <code>deterministic-v1</code>. Browser nhận tiến độ qua SSE có replay từ event đã persist; API là nguồn dữ liệu chuẩn. Cấu hình Cloudflare không cần API key trong frontend:

~~~toml
[vars]
AGENT_PROVIDER = "workers_ai"
WORKERS_AI_FORMULA_AGENT_MODEL = "@cf/openai/gpt-oss-120b"

[ai]
binding = "AI"
~~~

RAG v2 dùng multilingual <code>@cf/baai/bge-m3</code> để tạo vector 1.024 chiều. Cron re-index material <code>GLOBAL</code> đã curated và preload dần 1.986 Lluch global master reference vào namespace hệ thống; query chỉ chấp nhận D1 chunk và Vectorize metadata có <code>indexVersion=2</code>. Agent dùng GPT-OSS-120B chỉ để tạo typed research plan; mọi retrieval, formula math, inventory, costing và compliance vẫn do tool/domain service có quyền kiểm soát. Tenant được truy xuất global material evidence và evidence riêng của chính mình; document evidence của tenant khác không bao giờ được truy xuất. Hai index 768 chiều v1 được giữ tạm để rollback nhưng không còn nằm trong binding live.

### Trải nghiệm Formula Design Studio

### Fine Fragrance theo Accord

Fine Fragrance mới dùng luồng **Accord-first**: Studio tạo ba hướng Accord
concentrate, perfumer lưu các Accord phù hợp thành draft, rồi dùng **Compose Fine
Fragrance** để kết hợp ít nhất hai Accord. Raw material vẫn có thể được thêm trực
tiếp cho các điều chỉnh có chủ đích.

Mỗi Accord component được pin vào immutable Formula Version khi Fine draft được
tạo. Chỉnh sửa Accord về sau không làm thay đổi Fine Fragrance đã tạo; perfumer
phải refresh component một cách rõ ràng để tạo parent revision mới. Compose,
pinning và refresh không reserve hoặc consume inventory. Fine formula legacy vẫn
được review theo luồng cũ, không bị chặn hồi tố.

Design Studio dùng bố cục quyết định theo luồng **brief → directions → draft**. Brief và hướng sáng tạo được tách rõ; mỗi direction chỉ hiển thị phần tóm tắt để so sánh, còn pyramid, bằng chứng, thành phần riêng tư, chia sẻ và lưu draft nằm trong khu vực review khi người dùng chọn direction. Composer tạo brief nằm trong luồng trang thay vì sticky, nên cuộn trang không che directions hoặc detail ở phía dưới. Tiến độ nghiên cứu dùng motion nhẹ từ các component nguồn cục bộ lấy cảm hứng từ React Bits, tôn trọng reduced-motion và không làm thay đổi workflow, quyền hay dữ liệu công thức. Ở màn hình dưới 1380px, review chuyển xuống dưới danh sách directions trước khi các cột bị ép hẹp.

Direction Review hiển thị **Olfactive note review** theo Opening, Heart và Drydown. Mỗi material chỉ dùng mô tả sensory đã được curate trong Material Intelligence hoặc catalogue evidence; trường thiếu dữ liệu được nêu rõ, không sinh mô tả suy đoán.

Sau khi lưu direction thành draft, Direction Review hiển thị trạng thái Formula và hành động tiếp theo: **Submit for approval** ở Draft/Changes requested, rồi **Approve formula** khi đã In review và người dùng có quyền approver. Các action gọi workflow Formula hiện có trên server; material/compliance evidence chưa đạt hoặc Accord chưa có final-product context sẽ bị chặn với lý do rõ ràng.

Dialog **Review & approve brief** là review sheet có header/footer cố định, brief gốc, trạng thái gate rõ ràng, product setup, creative direction và material constraints thành các section riêng. Trên màn hình hẹp, các trường chuyển thành một cột và action chính luôn nằm ở footer để không bị lẫn trong danh sách material.

Tài liệu kiến trúc, protocol event, mô hình bảo mật công cụ và báo cáo checkpoint nằm tại [docs/agent-platform](docs/agent-platform/). Khi triển khai checkpoint Agent Platform, chạy tối thiểu:

~~~bash
npm run test
npm run build
npm run build:api
npm run typecheck:worker
npm run lint
~~~

Với Cloudflare release, chạy <code>npm run deploy:check</code> sau khi D1 migration và Worker secret đã sẵn sàng.

### Đăng nhập theo workspace

Từ system hostname như `workspace-slug.labofscents.org`, nút `Sign in` và
`Create workspace` luôn mở cổng trung tâm `https://labofscents.org`. Sau khi
xác thực, API trả `workspaceUrl` của membership và client chỉ redirect sang
hostname HTTPS của workspace đó. Vì vậy một user không bị "đăng nhập vào"
workspace của hostname mà họ đã truy cập ban đầu.

Khi session cũ còn hợp lệ, việc mở `/login?next=/workspace/...` trên cổng
trung tâm được khôi phục thẳng về route đích tại hostname workspace. Ứng dụng
không redirect qua `/login` của tenant lần thứ hai.

# OlfactoryOps

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
  AI["Workers AI<br/>embedding và text extraction"]
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
- Payload SDS/CoA riêng tư dùng binding <code>DOCUMENTS</code> của Workers KV trong beta. D1 chỉ lưu document metadata, scan/review status, ownership, version và access evidence. Signed download URL không được dùng làm RAG source.
- Material Evidence RAG chỉ lưu vector reference, excerpt giới hạn, content hash, review state và job metadata trong D1. Workers AI tạo embedding, Vectorize lưu vector theo tenant namespace; D1 kiểm tra lại tenant scope, approval, version, checksum và permission sau mỗi kết quả.

### Nhập supplier catalogue

- Lluch Essence Product List 2026 đã được nhập gồm 1.986 supplier product thuộc bốn nhóm: synthetic aroma chemical, natural aroma chemical, natural product và organic product. PDF nguồn có version <code>2026-07-16</code>, SHA-256 <code>ff6642fcec15f3505470710eca8452fd70d296f9a94a68f074dfe6f9201014a4</code>.
- Migration <code>0035_lluch_supplier_catalogue.sql</code> lưu import status và product row theo tenant trong D1. Worker scheduler nhập idempotent cho từng workspace để phục vụ evidence, truy xuất và traceability.
- Toàn bộ 1.986 sản phẩm Lluch hiện xuất hiện trực tiếp trong **Materials**, không có catalogue workspace riêng. Có thể tìm bằng product name, CAS, EINECS, FEMA hoặc supplier; hàng catalogue có nhãn **Needs review** và liên kết về supplier/category/page.
- Hàng Lluch source-only có thể được khám phá và chọn để bổ sung dữ liệu, nhưng không xuất hiện trong Inventory khi chưa có lot. Các trường thiếu từ PDF như odor profile, strength, diffusion, tenacity, volatility, IFRA, cost và compliance được hiển thị là cần review; chúng không được ngầm coi là dữ liệu kỹ thuật, compliance hay thương mại đã xác thực.

### Authentication và authorization

1. Người dùng đăng ký hoặc đăng nhập qua <code>/api/v1/auth/*</code>.
2. Worker tạo opaque session credential đã one-way hash và gửi bằng secure HTTP-only cookie. Browser JavaScript không nhận session secret.
3. <code>/api/v1/me</code> khôi phục session, workspace context, effective role permission và CSRF token.
4. Cookie-authenticated mutation cần <code>X-CSRF-Token</code>; route nhạy cảm có rate limit riêng. Opaque bearer credential chỉ được hỗ trợ rõ ràng cho non-browser tooling.
5. Mỗi request được xác thực, scope vào active organization, kiểm tra permission matrix và ghi audit evidence khi thay đổi controlled state.

Authentication không cấp quyền cross-tenant. Owner/Admin vẫn bị giới hạn theo permission: audit evidence được xem khi phù hợp, nhưng agent payload, document, cost, lot và formula composition riêng tư vẫn có capability gate độc lập.

### Topology triển khai

- **Local development:** Vite phục vụ browser tại <code>127.0.0.1:5173</code>; NestJS/Fastify phục vụ <code>/api/v1</code> tại <code>127.0.0.1:4000</code>.
- **Beta:** Cloudflare Pages phục vụ <code>test.labofscents.pages.dev</code>; Worker <code>olfactoryops-api-test</code> dùng D1 <code>olfactoryops-test</code> tách biệt, test KV namespace riêng tư và Vectorize index <code>olfactoryops-material-evidence-test</code>.
- **Production:** Cloudflare Pages phục vụ public/workspace frontend; Worker <code>olfactoryops-api</code> dùng D1 và Vectorize index production. Production binding, custom domain và provider secret được cấu hình trong Cloudflare, không commit vào Git hoặc đưa ra frontend.
- <code>wrangler.test.toml</code> là cấu hình test; <code>wrangler.toml</code> là production binding. Luôn chạy migration trên đúng D1 database trước khi deploy Worker.

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

- Email: <code>admin@labofscents.org</code>
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
- <code>0033_material_evidence_rag.sql</code> thêm reviewed evidence source, citation chunk có giới hạn và lease-fenced indexing job theo tenant. Trước khi deploy, tạo Vectorize cosine 768-dimension index riêng cho test/production; thêm binding <code>AI</code> và <code>RAG_INDEX</code>; tạo metadata index cho <code>organizationId</code>, <code>status</code>, <code>materialId</code>, <code>documentId</code>, <code>sourceKind</code> và <code>indexVersion</code>.
- <code>0035_lluch_supplier_catalogue.sql</code> nhập Lluch Essence Product List 1.986 dòng vào supplier-catalogue table theo tenant trong D1. Áp migration trước Worker; scheduled run đầu tiên hoặc authorized **Sync catalogue** sẽ nhập idempotent cho từng workspace.
- Production batch chỉ tạo finished-good lot khi formula input approved, raw-material consumption đầy đủ, QC pass và release. Formula SKU reserve released finished-good lot bằng FEFO và chỉ ghi COGS khi fulfilled.
- <code>GET /api/v1/audit/chain/verify</code> và <code>GET /api/v1/audit/chain/evidence</code> là evidence endpoint chỉ dành cho Owner/Admin và không bao giờ trả provider secret.
- Beta integration luôn trung thực: Integration Readiness trả <code>Not configured</code> cho đến khi Worker secret và phụ thuộc DNS/HTTPS thật sự active. <code>managed_beta</code> tiếp tục từ chối toàn bộ Stripe customer-payment mutation ở server.

Với Worker beta tách biệt, dùng rõ test configuration:

~~~bash
npx wrangler d1 migrations apply olfactoryops-test --remote --config wrangler.test.toml
npm run deploy:worker -- --config wrangler.test.toml
npm run deploy:pages:test
~~~

Không deploy Worker khi remote D1 migration chưa thành công. <code>beta.labofscents.org</code> vẫn là external DNS/Pages custom-domain gate; Pages preview thành công không chứng minh hostname đã resolve hoặc có HTTPS certificate hợp lệ.

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

- **Managed beta billing:** <code>BILLING_MODE=managed_beta</code> là mặc định. Nó ẩn plan/invoice khỏi customer UI và từ chối checkout, portal, plan-change, Stripe webhook ở server. Chỉ chuyển sang <code>self_service</code> sau khi Stripe credential, price ID và webhook validation đã cấu hình.
- **Transactional email:** in-app notification outbox được persist trong D1, gửi invite, new-device security, billing và privacy-request qua Resend khi có <code>RESEND_API_KEY</code> và <code>EMAIL_FROM</code>. Lỗi retry bằng bounded backoff và không rollback business mutation.
- **Cloudflare for SaaS:** Owner/Admin chỉ provision hoặc refresh customer hostname khi Cloudflare API token, SaaS zone ID và optional custom origin đã cấu hình. Workspace hostname chỉ thay đổi khi Cloudflare trả hostname và SSL active; DCV/provider error vẫn hiển thị khi pending.
- **Import CSV/XLSX:** Material Library nhận CSV/XLSX cho material và inventory lot, cho phép mapping cột, dry-run có row-level error và chỉ commit validated idempotent job. Lot có thể khớp material theo ID, CAS hoặc name.
- **PWA và QR:** Production build đăng ký privacy-safe app-shell service worker; API response không cache. Inventory quét QR lot qua browser camera và chỉ chọn lot trong workspace hiện tại.
- **Notification và legal:** Member inbox hỗ trợ invitation, security, billing, low-stock và expiry. Password-reset token one-time/hash; legal consent có version; member tải scoped JSON personal-data export hoặc yêu cầu erasure review.
- **Observability và ngôn ngữ:** <code>GET /api/v1/status</code> báo D1 và số slow/error event gần đây. Optional Sentry chỉ nhận route, status, duration cho Worker 5xx. Tenant locale hỗ trợ English/Vietnamese ở shell, navigation, authentication và notification; dữ liệu hương liệu kỹ thuật giữ language-neutral.

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

Với Cloudflare release, chạy <code>npm run deploy:check</code> sau khi D1 migration và Worker secret đã sẵn sàng.

import { ArrowRight, Boxes, ClipboardCheck, FlaskConical, PackageCheck, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { useEffect } from 'react'
import { ScrollReveal } from '../../ui/motion/MotionPrimitives'
import './publicLanding.css'

type Locale = 'en-US' | 'vi-VN'

type LandingCopy = {
  nav: { workflow: string; intelligence: string; trust: string; signIn: string; trial: string }
  eyebrow: string
  title: string
  subtitle: string
  primary: string
  secondary: string
  heroCaption: string
  workflowTitle: string
  workflowLead: string
  workflow: Array<{ title: string; copy: string }>
  rolesTitle: string
  roles: Array<{ title: string; copy: string }>
  productTitle: string
  productLead: string
  product: Array<{ title: string; copy: string }>
  intelligenceTitle: string
  intelligenceLead: string
  trustTitle: string
  trustLead: string
  trust: Array<{ title: string; copy: string }>
  calloutTitle: string
  calloutCopy: string
  footer: string
  status: string
}

const copy: Record<Locale, LandingCopy> = {
  'en-US': {
    nav: { workflow: 'Workflow', intelligence: 'Formula operations', trust: 'Trust', signIn: 'Sign in', trial: 'Create workspace' },
    eyebrow: 'OlfactoryOps beta',
    title: 'The operating system for fragrance teams',
    subtitle: 'From brief to batch, formula operations and operational control in one workspace.',
    primary: 'Create workspace',
    secondary: 'Explore the workflow',
    heroCaption: 'A controlled workspace for formula, inventory, production, and commercial decisions.',
    workflowTitle: 'One operating flow, without losing the craft',
    workflowLead: 'Keep creative direction, material evidence, production checkpoints, and delivery decisions connected to the same source of truth.',
    workflow: [
      { title: 'Brief', copy: 'Capture the product direction, markets, concentration, and material constraints.' },
      { title: 'Formula', copy: 'Develop a reviewable composition with compliance and availability evidence.' },
      { title: 'Batch', copy: 'Move approved work into weighed, controlled production with traceability.' },
      { title: 'Deliver', copy: 'Quote, fulfill, reconcile COGS, and learn from actual operations.' },
    ],
    rolesTitle: 'A shared language for the people behind the product',
    roles: [
      { title: 'Perfumer', copy: 'Build formulas, compare revisions, and retain the review record behind each draft.' },
      { title: 'Lab & production', copy: 'Work from approved formula data through controlled stock, QC, and release.' },
      { title: 'Brand & commercial', copy: 'Contribute a brief and review safe decisions without exposing sensitive composition or cost.' },
    ],
    productTitle: 'Built around real fragrance operations',
    productLead: 'The workbench stays quiet. Evidence appears when a decision needs it.',
    product: [
      { title: 'Materials & inventory', copy: 'Catalog, lots, compliance review, receiving, weighing, and movement traceability.' },
      { title: 'Formula operations', copy: 'Versioned formulas, compliance evidence, and approval gates keep every change reviewable.' },
      { title: 'Production & commercial', copy: 'Move from approved batch to fulfillment, with cost and margin decisions where authorized.' },
    ],
    intelligenceTitle: 'Formula operations, kept under control',
    intelligenceLead: 'Research runs are typed, permission-aware, auditable, and confirmation-based. A proposed draft never reserves or consumes stock by itself.',
    trustTitle: 'Tenant trust is part of the product',
    trustLead: 'Workspace data, actions, and approvals stay scoped to the people who are allowed to make that decision.',
    trust: [
      { title: 'Role-aware access', copy: 'Views and actions follow existing workspace permissions.' },
      { title: 'Approval & audit', copy: 'Controlled actions retain review and audit evidence.' },
      { title: 'Private by default', copy: 'Sensitive formula, lot, and cost evidence stays capability-gated.' },
    ],
    calloutTitle: 'Start with your own workspace',
    calloutCopy: 'OlfactoryOps is in managed beta. Create a workspace to explore the governed workflow with your team.',
    footer: 'Fragrance operations, made operational.',
    status: 'Beta status',
  },
  'vi-VN': {
    nav: { workflow: 'Quy trinh', intelligence: 'Formula operations', trust: 'Tin cay', signIn: 'Dang nhap', trial: 'Tao workspace' },
    eyebrow: 'OlfactoryOps beta',
    title: 'He dieu hanh cho doi ngu nuoc hoa',
    subtitle: 'Tu brief den batch, formula operations va kiem soat van hanh trong mot workspace.',
    primary: 'Tao workspace',
    secondary: 'Kham pha quy trinh',
    heroCaption: 'Workspace co kiem soat cho formula, inventory, production va quyet dinh thuong mai.',
    workflowTitle: 'Mot luong van hanh, van giu duoc tinh thu cong',
    workflowLead: 'Ket noi creative direction, bang chung nguyen lieu, checkpoint san xuat va quyet dinh giao hang trong cung mot nguon du lieu.',
    workflow: [
      { title: 'Brief', copy: 'Ghi nhan huong san pham, thi truong, nong do va rang buoc nguyen lieu.' },
      { title: 'Formula', copy: 'Phat trien composition co the review, kem bang chung compliance va kha dung.' },
      { title: 'Batch', copy: 'Chuyen cong viec da duyet sang san xuat co can, co kiem soat va truy xuat.' },
      { title: 'Deliver', copy: 'Bao gia, fulfil, doi chieu COGS va hoc tu van hanh thuc te.' },
    ],
    rolesTitle: 'Mot ngon ngu chung cho nhung nguoi tao ra san pham',
    roles: [
      { title: 'Perfumer', copy: 'Xay dung cong thuc, so sanh ban sua doi va giu lai ly do cua tung draft.' },
      { title: 'Lab va production', copy: 'Lam viec tu formula da duyet qua stock, QC va release co kiem soat.' },
      { title: 'Brand va commercial', copy: 'Dong gop brief va review quyet dinh an toan ma khong lo composition hay cost nhay cam.' },
    ],
    productTitle: 'Duoc xay dung tu van hanh nuoc hoa thuc te',
    productLead: 'Workbench giu su yen tinh. Bang chung chi xuat hien khi mot quyet dinh can den no.',
    product: [
      { title: 'Materials va inventory', copy: 'Catalog, lot, compliance review, receiving, weighing va movement traceability.' },
      { title: 'Formula operations', copy: 'Formula co phien ban, bang chung tuan thu va cong doan phe duyet ro rang.' },
      { title: 'Production va commercial', copy: 'Di tu batch da duyet den fulfillment, voi quyet dinh cost va margin dung quyen.' },
    ],
    intelligenceTitle: 'Formula operations duoc kiem soat',
    intelligenceLead: 'Research run co schema, phan quyen, audit va confirmation. Draft de xuat khong tu reserve hay consume stock.',
    trustTitle: 'Tenant trust la mot phan cua san pham',
    trustLead: 'Du lieu workspace, action va approval luon duoc scope cho dung nguoi duoc phep quyet dinh.',
    trust: [
      { title: 'Quyen theo vai tro', copy: 'View va action tuan theo permission cua workspace.' },
      { title: 'Approval va audit', copy: 'Action can kiem soat giu lai bang chung review va audit.' },
      { title: 'Private mac dinh', copy: 'Formula, lot va cost nhay cam luon duoc capability-gated.' },
    ],
    calloutTitle: 'Bat dau voi workspace cua ban',
    calloutCopy: 'OlfactoryOps dang o managed beta. Tao workspace de trai nghiem luong van hanh co kiem soat cung team.',
    footer: 'Fragrance operations, made operational.',
    status: 'Trang thai beta',
  },
}

function ProductSurface({ caption }: { caption: string }) {
  return <figure className="landing-product-surface" aria-label={caption}>
    <div className="landing-product-topline"><span>OlfactoryOps</span><span>Formula R&D</span><span>Workspace guard</span></div>
    <div className="landing-product-body">
      <aside><span>Workbench</span><strong>Formula operations</strong><span>Materials</span><span>Inventory</span><span>Production</span></aside>
      <section><header><span>Fine fragrance brief</span><strong>Coastal amber</strong><small>Research ready for review</small></header><div className="landing-product-steps"><span>Brief</span><span className="is-active">Direction</span><span>Review</span><span>Draft</span></div><div className="landing-product-cards"><article><span>Bright opening</span><strong>Citrus, salt, clean woods</strong><small>Eligible catalog first</small></article><article><span>Compliance</span><strong>Review required</strong><small>Evidence available on review</small></article></div></section>
    </div>
    <figcaption>{caption}</figcaption>
  </figure>
}

export function PublicLanding({ locale, onNavigate, onLocaleChange }: { locale: Locale; onNavigate: (path: '/login' | '/signup') => void; onLocaleChange: (locale: Locale) => void }) {
  const text = copy[locale]
  const oppositeLocale: Locale = locale === 'en-US' ? 'vi-VN' : 'en-US'
  useEffect(() => {
    const description = `${text.title}. ${text.subtitle}`
    document.title = locale === 'vi-VN' ? 'OlfactoryOps | Van hanh nuoc hoa' : 'OlfactoryOps | Fragrance operations'
    document.documentElement.lang = locale
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description)
  }, [locale, text.subtitle, text.title])
  return <main className="landing-page" data-testid="public-landing">
    <header className="landing-nav"><button type="button" className="landing-wordmark" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span className="landing-mark"><Sparkles size={16} /></span><span>OlfactoryOps</span></button><nav aria-label="Public navigation"><a href="#workflow">{text.nav.workflow}</a><a href="#intelligence">{text.nav.intelligence}</a><a href="#trust">{text.nav.trust}</a></nav><div className="landing-nav-actions"><button type="button" className="landing-locale" onClick={() => onLocaleChange(oppositeLocale)}>{locale === 'en-US' ? 'VI' : 'EN'}</button><button type="button" className="landing-link" onClick={() => onNavigate('/login')}>{text.nav.signIn}</button><button type="button" className="landing-cta compact" onClick={() => onNavigate('/signup')}>{text.nav.trial}</button></div></header>

    <section className="landing-hero"><ProductSurface caption={text.heroCaption} /><div className="landing-hero-overlay" /><div className="landing-hero-copy"><span className="landing-eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.subtitle}</p><div className="landing-actions"><button className="landing-cta" type="button" onClick={() => onNavigate('/signup')}>{text.primary}<ArrowRight size={17} /></button><a className="landing-secondary" href="#workflow">{text.secondary}</a></div></div></section>

    <section id="workflow" className="landing-section landing-flow"><ScrollReveal><div className="landing-section-heading"><span className="landing-eyebrow">01 / {text.nav.workflow}</span><h2>{text.workflowTitle}</h2><p>{text.workflowLead}</p></div></ScrollReveal><div className="landing-workflow">{text.workflow.map((item, index) => <ScrollReveal key={item.title} delay={index * 0.03}><article><span>0{index + 1}</span><h3>{item.title}</h3><p>{item.copy}</p></article></ScrollReveal>)}</div></section>

    <section className="landing-section landing-role-section"><div className="landing-section-heading"><span className="landing-eyebrow">02 / Team</span><h2>{text.rolesTitle}</h2></div><div className="landing-role-list">{text.roles.map((role, index) => <ScrollReveal key={role.title} delay={index * 0.04}><article><span className="landing-role-icon">{index === 0 ? <FlaskConical size={19} /> : index === 1 ? <ClipboardCheck size={19} /> : <UsersRound size={19} />}</span><h3>{role.title}</h3><p>{role.copy}</p></article></ScrollReveal>)}</div></section>

    <section className="landing-section landing-product-section"><div className="landing-section-heading"><span className="landing-eyebrow">03 / Product</span><h2>{text.productTitle}</h2><p>{text.productLead}</p></div><div className="landing-product-list">{text.product.map((item, index) => <ScrollReveal key={item.title} delay={index * 0.04}><article><span>{index === 0 ? <Boxes size={20} /> : index === 1 ? <Sparkles size={20} /> : <PackageCheck size={20} />}</span><div><h3>{item.title}</h3><p>{item.copy}</p></div></article></ScrollReveal>)}</div></section>

    <section id="intelligence" className="landing-section landing-intelligence"><ScrollReveal><div><span className="landing-eyebrow">04 / {text.nav.intelligence}</span><h2>{text.intelligenceTitle}</h2><p>{text.intelligenceLead}</p></div></ScrollReveal><ScrollReveal delay={0.05}><div className="landing-intelligence-note"><span>Research workspace</span><strong>Brief, direction, governed evidence, confirmation.</strong><small>Workers AI plans research; deterministic services retain operational authority.</small></div></ScrollReveal></section>

    <section id="trust" className="landing-section landing-trust"><div className="landing-section-heading"><span className="landing-eyebrow">05 / {text.nav.trust}</span><h2>{text.trustTitle}</h2><p>{text.trustLead}</p></div><div>{text.trust.map((item, index) => <ScrollReveal key={item.title} delay={index * 0.04}><article><ShieldCheck size={19} /><div><h3>{item.title}</h3><p>{item.copy}</p></div></article></ScrollReveal>)}</div></section>

    <section className="landing-final"><div><span className="landing-eyebrow">Managed beta</span><h2>{text.calloutTitle}</h2><p>{text.calloutCopy}</p></div><button className="landing-cta" type="button" onClick={() => onNavigate('/signup')}>{text.primary}<ArrowRight size={17} /></button></section>
    <footer className="landing-footer"><span>OlfactoryOps</span><span>{text.footer}</span><a href="mailto:beta@labofscents.org">{text.status}</a></footer>
  </main>
}

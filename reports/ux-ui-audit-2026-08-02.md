# OlfactoryOps UX/UI Audit - 2026-08-02

## Executive summary

**Release verdict: Not ready for a broad beta UX sign-off.** Public landing, signup, the authenticated shell, and the empty Design Studio state render without console errors or horizontal document overflow. The structured brief workflow nevertheless contains confirmed mobile usability failures, and the styling architecture still lets legacy rules override the current Quiet Lab layer.

The audit used a dedicated test workspace on `test.labofscents.pages.dev`; no production data was read or changed. Owner coverage is live. Other roles remain **Needs Verification** until deterministic role fixtures are available.

| Priority | Count | Meaning |
| --- | ---: | --- |
| P0 | 2 | Blocks comfortable completion of a core mobile workflow |
| P1 | 3 | Damages hierarchy, routing continuity, or consistent interaction |
| P2 | 3 | Shared design-system and accessibility debt |
| P3 | 2 | Copy and visual polish |

## Remediation checkpoint

**Checkpoint verdict: P0/P1 Design Studio PASS; broad role sign-off remains PARTIAL.** The confirmed control, dialog, route-restoration, direction-detail and mobile overflow defects were remediated locally against the test Worker. The authenticated Owner flow now passes axe critical/serious checks and visual regression at 1280 and 390px. Admin, Perfumer, Lab Manager, Sensory Panelist, Brand, Finance and Read-only walkthroughs remain `Needs Verification`; this report does not infer their behavior from Owner coverage.

| Issue | Result | Verification |
| --- | --- | --- |
| UX-001 | PASS | Brief inputs/selects compute to 44px in desktop and mobile Playwright checks |
| UX-002 | PASS | Dialog uses fixed header/footer, independently scrolling body, 44px close target and mobile bottom sheet |
| UX-003 | PARTIAL | Design tokens now have one `:root` source; legacy feature selectors still require staged extraction from `index.css` |
| UX-004 | PASS | Protected routes wait on a neutral session-restore state and preserve the validated internal destination |
| UX-005 | PASS for current Owner flow | Direction rows are concise; one detail surface is shown, using an accessible drawer/sheet below 1120px |
| UX-006 | PASS for shared shell/forms | Shared actions, navigation, form controls and mobile shell targets use the 44px contract |
| UX-007 | PASS for structured brief | Escape, backdrop, close and Cancel warn before discarding dirty brief changes |
| UX-008 | PARTIAL | Shared matte surfaces and radii are normalized; remaining legacy selectors are tracked under UX-003 |
| UX-009 | PASS for Formula Intelligence | Known raw errors and workflow statuses are projected to user-facing copy |
| UX-010 | PASS for covered routes | Visual tests run with reduced motion and wait for stable dialog state before capture |

Automated evidence:

- `e2e/ux-ui.playwright.ts`: public EN/VI, overflow, axe, protected-route restore, 44px actions and Design Studio dialog.
- `e2e/visual-snapshots/`: 1280px and 390px public and authenticated dialog baselines.
- `playwright.ux.config.ts`: reduced-motion Chromium projects with deterministic screenshot settings.

## System map

- **Framework:** React 19, Vite 8, native CSS, Tailwind base directives.
- **Component/motion layer:** local workspace primitives, Lucide icons, Framer Motion-based React Bits-inspired primitives.
- **Global style order:** `index.css` -> `tokens.css` -> `shell.css` -> `components.css` -> `features.css`.
- **Primary routes:** public `/`, `/login`, `/signup`; Workbench `/workspace`, Materials, Formulas, Design Studio, Optimizer, Trials, Inventory, Lab Usage; Operations Production, Procurement, Orders; Commercial Catalog/Quotes and capability-gated Costing; Insights Analytics; Workspace settings; internal Platform.
- **Design direction:** Quiet Lab, matte near-black surfaces, ivory type, controlled verdigris accent.

## Verified environment

- Browser: Chromium through the Codex in-app browser.
- Live target: `https://test.labofscents.pages.dev`.
- Viewports sampled for Design Studio: 320, 375, 390, 768, 1024, 1280, 1440, 1920 px.
- Live role: newly provisioned Owner in a dedicated audit tenant.
- Console: no relevant warnings or errors on public landing, signup, workspace home, or the inspected Design Studio states.
- Horizontal document overflow: not reproduced on the sampled Design Studio viewports.

## Issue summary

| ID | Priority | Type | Module | Issue | Confidence |
| --- | --- | --- | --- | --- | --- |
| UX-001 | P0 | Usability / Accessibility | Shared forms | Inputs and selects collapse to 17-19px in structured brief | Confirmed |
| UX-002 | P0 | Usability / Accessibility | Workspace dialog | Mobile close action is 24px and long-form dialog hierarchy collides | Confirmed |
| UX-003 | P1 | Architecture | Global CSS | Tokens and core selectors are declared in competing layers | Confirmed |
| UX-004 | P1 | Navigation | Protected workspace routes | Direct refresh briefly shows login and can restore to Home instead of requested module | Confirmed |
| UX-005 | P1 | Information hierarchy | Design Studio | Projects/directions repeat large bordered blocks and expose workflow density too early | Confirmed from supplied live evidence; seeded empty state verified |
| UX-006 | P2 | Accessibility | Shell and actions | Many visible controls are 33-40px high, below the 44px mobile target | Confirmed |
| UX-007 | P2 | Interaction safety | Shared dialog | Backdrop/Escape always close forms without a dirty-state contract | Confirmed in code |
| UX-008 | P2 | Visual consistency | Shared surfaces | Legacy `glass` contract and nested borders conflict with matte Quiet Lab styling | Confirmed |
| UX-009 | P3 | Microcopy | Formula Intelligence | Raw status/error vocabulary can surface in historical/live states | Partially fixed; regression coverage missing |
| UX-010 | P3 | Motion | Workspace | Route entrance can temporarily reduce content readability during screenshot/fast navigation | Needs Verification |

## Reproduction matrix

Values in `Observed baseline` were captured before remediation. A dash means the issue is architectural or state-based rather than a single numeric CSS value.

| ID | Route / viewport / role | Selector or component | Observed baseline | Proposed contract | Evidence |
| --- | --- | --- | --- | --- | --- |
| UX-001 | Design Studio / 390px / Owner | `.formula-intelligence-structured-grid input, select` | 17-19px control height | 44px minimum | `before/design-studio-dialog-390.png` |
| UX-002 | Design Studio / 390px / Owner | `WorkspaceDialog`, `.workspace-dialog-close` | 24x38px close; 1631px form body inside 796px viewport | 44x44px close; fixed header/footer; independently scrolling body | `before/design-studio-dialog-390.png` |
| UX-003 | All routes / all widths / all roles | `:root`, `.glass`, `.panel`, Formula Intelligence selectors | Duplicate declarations across `index.css` and style layers | One token root and one owner per shared component contract | Source inventory |
| UX-004 | Protected deep link / 1280px / Owner | `App` session restore and `publicRoute` | Login surface briefly replaces requested module | Neutral restore surface, then validated internal route | Browser navigation trace |
| UX-005 | Design Studio / 616px and 1280px / Owner | `.formula-intelligence-projects`, direction cards, selected detail | Repeated full cards and competing detail surface | Concise rows, one expanded round and one contextual detail | User-supplied live evidence plus `before/design-studio-1280.png` |
| UX-006 | Shell and forms / 390px / Owner | `.nav-item`, buttons, icon actions | 33-40px visible targets | 44x44px minimum interactive target | Computed-style sample |
| UX-007 | Design Studio dialog / 1280px / Owner | `WorkspaceDialog` Escape, backdrop, close, Cancel | Dirty form closes without confirmation | One shared discard confirmation contract | Component inspection |
| UX-008 | Workspace / 390-1440px / Owner | `.glass`, `.panel`, nested cards | Competing translucency, radius and border rules | Matte surface, 6px panel/card and 8px dialog/drawer radius | Source inventory and viewport screenshots |
| UX-009 | Design Studio / 616px / Owner | `.agent-notice`, workflow status | Raw `FORMULA_INTELLIGENCE_*` and `in_review` can surface | Stable user-facing status and recovery copy | User-supplied live evidence |
| UX-010 | Public and workspace routes / 390-1280px / Owner | `AnimatedContent`, route entrance | Capture can occur during opacity/position transition | Deterministic reduced-motion rendering for QA | Needs Verification at baseline |

## Route, viewport and role matrix

| Surface | 320 | 375 | 390 | 768 | 1024 | 1280 | 1440 | 1920 | Verified roles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public `/` EN/VI | Sampled | Sampled | PASS | Sampled | Sampled | PASS | Sampled | Sampled | Unauthenticated |
| Auth `/login`, `/signup` | Sampled | Sampled | PASS | Sampled | Sampled | PASS | Sampled | Sampled | Unauthenticated |
| Workbench shell | Sampled | Sampled | PASS | Sampled | Sampled | PASS | Sampled | Sampled | Owner; others Needs Verification |
| Design Studio default/review | Sampled | Sampled | PASS | Sampled | Sampled | PASS | Sampled | Sampled | Owner; others Needs Verification |
| Materials, Formulas, Optimizer, Trials, Inventory, Lab Usage | Needs Verification | Needs Verification | Smoke only | Needs Verification | Needs Verification | Smoke only | Needs Verification | Needs Verification | Owner smoke; role fixtures missing |
| Production, Procurement, Orders | Needs Verification | Needs Verification | Smoke only | Needs Verification | Needs Verification | Smoke only | Needs Verification | Needs Verification | Owner smoke; role fixtures missing |
| Catalog/Quotes, Costing, Analytics | Needs Verification | Needs Verification | Smoke only | Needs Verification | Needs Verification | Smoke only | Needs Verification | Needs Verification | Capability fixtures missing |
| Workspace and Platform | Needs Verification | Needs Verification | Smoke only | Needs Verification | Needs Verification | Smoke only | Needs Verification | Needs Verification | Owner smoke; tenant-role projection pending |

## Detailed findings

### UX-001 - Structured brief controls are below usable size

- **Route:** `/ai/formula-design-studio`
- **Viewport:** 390 x 844
- **State:** structured brief review dialog
- **Observed:** selects render at 17px and text inputs at 19px high. The primary action is 38px high.
- **Expected:** desktop controls at least 38-40px and mobile interactive controls at least 44px, with consistent label-to-field rhythm.
- **Root cause:** legacy native control rules win for feature-specific fields; the shared component layer does not own a complete control contract.
- **Evidence:** `reports/ux-ui-audit-assets/before/design-studio-dialog-390.png`.
- **Regression:** input/select/textarea heights, zoom at 200%, long Vietnamese labels, validation messages, disabled and focus states.

### UX-002 - Mobile dialog hierarchy and close target are unsafe

- **Route:** `/ai/formula-design-studio`
- **Viewport:** 390 x 844
- **Observed:** the close action is 24 x 38px; original-request content visually crowds the header; the footer occupies 98px while the body scrolls through 1631px of content.
- **Expected:** 44px close target, clear header/body separation, one-column sections, sticky footer, and no clipped focus ring.
- **Root cause:** `WorkspaceDialog` provides focus trapping but feature CSS overrides density without a shared mobile dialog geometry contract.
- **Evidence:** `reports/ux-ui-audit-assets/before/design-studio-dialog-390.png`.

### UX-003 - CSS has multiple sources of truth

- **Files:** `src/index.css`, `src/styles/tokens.css`, `src/styles/components.css`, `src/styles/features.css`.
- **Observed:** `:root`, `.glass`, `.panel`, `.primary-button`, and Formula Intelligence selectors are declared more than once. `index.css` contains about 6,900 lines while the newer style layers override only part of it.
- **Impact:** computed values depend on import/order rather than a documented component contract, making responsive fixes regress unrelated screens.
- **Expected:** one token source, one shared-component source, feature styles scoped to features, no final override appendix.

### UX-004 - Protected route restoration is unstable

- **Observed:** direct navigation/refresh of a protected module first rendered `/login?next=...`; hydration later restored the session but sometimes landed on `/workspace` rather than the requested module.
- **Impact:** refresh, deep links, and visual tests lose the user's current task.
- **Expected:** one neutral session-loading state, then the validated internal `next` route or current protected path.

### UX-005 - Design Studio hierarchy becomes repetitive with generated work

- **Evidence:** supplied live screenshots show project cards containing three full direction cards, repeated again for each project, plus a competing detail panel.
- **Expected:** collapsed generation rounds, concise direction rows, one selected detail surface, and one clear next action.
- **Compatibility:** direction identity, sharing, feedback, redaction, and save-draft permissions must remain unchanged.

## Role and route coverage

| Role | Live verification | Notes |
| --- | --- | --- |
| Owner | Partial PASS | Public/auth, shell, Home, empty Design Studio, brief creation, review dialog |
| Admin | Needs Verification | Requires deterministic fixture |
| Perfumer | Needs Verification | Required for sensitive direction/save actions |
| Lab Manager | Needs Verification | Required for inventory/production actions |
| Sensory Panelist | Needs Verification | Restricted trial presentation |
| Brand | Needs Verification | Direction safe projection/share flow |
| Finance | Needs Verification | Costing visibility |
| Read-only | Needs Verification | Action hiding and permission feedback |

## Accessibility and coverage status

- Resolved for covered routes: automated axe critical/serious gate, horizontal-overflow assertion, 44px Design Studio targets, dialog dirty-state behavior and deterministic reduced-motion screenshots.
- Resolved for the shared dialog: focus trap, Escape/backdrop/close behavior, focus restore, body scroll lock and mobile bottom-sheet geometry.
- Remaining: deterministic Admin, Perfumer, Lab Manager, Sensory Panelist, Brand, Finance and Read-only fixtures.
- Remaining: authenticated table-to-mobile-row behavior and chart label overflow with representative dense data.
- Remaining: CI credentials are required to run the authenticated Owner flow; without them the test is explicitly skipped rather than reported as PASS.

## Remediation order

1. Consolidate tokens and shared control/dialog geometry.
2. Fix protected route restoration and stable loading state.
3. Rework Design Studio into composer, round list, and selected detail surfaces.
4. Apply shared shell/table/status/error-state rules across modules.
5. Add deterministic role fixtures, axe checks, visual screenshots, and release gates.

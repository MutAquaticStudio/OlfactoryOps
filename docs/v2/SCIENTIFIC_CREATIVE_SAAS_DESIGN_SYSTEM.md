# Scientific Creative SaaS Design System

## Decision

OlfactoryOps will use **Scientific Creative SaaS**: a dense, calm, graphite
workspace for fragrance R&D that pairs scientific evidence with a deliberate
creative workbench. It is not an admin template and it must not imply that
unreleased intelligence capabilities are available.

| Direction | Strength | Limitation | Decision |
| --- | --- | --- | --- |
| Precision Scientific SaaS | Strong evidence hierarchy and operational readability | Too clinical for a perfumer's daily workspace | Supporting influence |
| Creative Intelligence Workspace | Strong brief-to-review flow and investor narrative | Can become decorative or imply unavailable AI | Supporting influence |
| Scientific Creative SaaS | Balances data density, product character, and truthful workflow states | Requires disciplined semantic tokens | **Selected** |

## Research Applied

UI UX Pro Max research supports a data-dense dashboard grid, compact but
readable controls, sticky table headers, keyboard-operable controls, visible
focus, and reduced motion. Its dashboard guidance informs the 8px grid,
12-column desktop layout, 36--40px controls, and technical mono values. Its
creative-tool guidance informs layered depth, an optional display face, and
careful progressive disclosure.

Generic glassmorphism, cyberpunk, neon, large radii, and decorative 3D charts
are explicitly rejected. The skill's `Fira Sans` plus `Fira Code` pairing is
the application baseline; a restrained display face is limited to the Design
Studio and investor-oriented workspace overview.

## Tokens

```css
--background: #101413;
--surface-1: #151c1a;
--surface-2: #1a2421;
--surface-3: #21302b;
--surface-hover: #24352f;
--border-subtle: #2b3b35;
--border-strong: #496458;
--text-primary: #f1f5f2;
--text-secondary: #b7c5bd;
--text-muted: #7f9288;
--accent: #45b88a;
--accent-hover: #64c89f;
--information: #55a7e8;
--success: #45b88a;
--warning: #e4ad52;
--danger: #d66f70;
```

The spacing scale is 4, 8, 12, 16, 24, 32, and 48px. Controls are 36px by
default and 40px for primary actions. Radius is 4px for controls, 8px for
panels, and 12px only for large overlays. Elevation is reserved for modal and
inspector layers. Focus rings use a high-contrast mint outline with an offset.
Motion uses 160ms for state changes and 220ms for panels; all motion is
disabled or reduced when the system requests it.

## Information Architecture

The production navigation is derived from the feature-route contract, never
from aspirational modules:

- **Home:** workspace overview.
- **R&D:** Materials, Formulas, Design Studio.
- **Operations:** Inventory, Suppliers, Procurement.
- **Intelligence:** Agent Console.
- **System:** Workspace Settings, Members & Security, Observability.

Trials, Production, Commerce, and Advanced remain absent from public active
navigation when their feature-route contract marks them unavailable. Existing
deep links continue to use the unavailable surface.

## Screen Rules

- Home explains material intelligence, formula work, and operational attention
  in one viewport using live data or an explicit empty state.
- Materials, formulas, and operations use a reusable dense-table pattern:
  sticky header, numeric alignment, technical mono values, row hover, and a
  contained horizontal scroll on narrow screens.
- Formula and Design Studio reserve a contextual inspector area on wide
  screens. It contains only context, evidence, and next actions.
- Design Studio presents the six-step workflow honestly. Generation is an
  unavailable product state until a reviewed material universe is ready; it
  never renders fake candidates or provider diagnostics.
- Agent Console keeps conversation, activity, evidence, approvals, and run
  state visually separate. It never exposes private reasoning.
- Transport failures map to clear product states with retry affordances; raw
  `Failed to fetch` text is never a primary UI message.

## Responsive and Accessibility Baseline

Desktop uses the full workspace at 1440px and 1920px rather than centering a
narrow column. At 1024px the inspector collapses. At 768px navigation becomes
a compact, scrollable rail or disclosure; tables keep contained horizontal
scroll. At 375px the primary work remains first, secondary context moves
below it, and controls retain usable labels and targets.

All interactive controls are native buttons or labelled form fields. Keyboard
focus is visible, status never relies only on color, empty/error/loading states
are announced appropriately, and motion follows `prefers-reduced-motion`.

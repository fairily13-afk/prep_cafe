---
name: BrewMetrics Pastel Clean
colors:
  surface: '#f7faf8'
  surface-dim: '#d7dbd9'
  surface-bright: '#f7faf8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f2'
  surface-container: '#ebefed'
  surface-container-high: '#e6e9e7'
  surface-container-highest: '#e0e3e1'
  on-surface: '#181c1b'
  on-surface-variant: '#404944'
  inverse-surface: '#2d3130'
  inverse-on-surface: '#eef1ef'
  outline: '#707973'
  outline-variant: '#c0c9c2'
  surface-tint: '#326852'
  primary: '#2f664f'
  on-primary: '#ffffff'
  primary-container: '#497f67'
  on-primary-container: '#f5fff7'
  inverse-primary: '#9ad3b7'
  secondary: '#8c4f26'
  on-secondary: '#ffffff'
  secondary-container: '#ffaf7d'
  on-secondary-container: '#794018'
  tertiary: '#4b5b83'
  on-tertiary: '#ffffff'
  tertiary-container: '#63749d'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b5efd2'
  primary-fixed-dim: '#9ad3b7'
  on-primary-fixed: '#002115'
  on-primary-fixed-variant: '#16503b'
  secondary-fixed: '#ffdbc8'
  secondary-fixed-dim: '#ffb68a'
  on-secondary-fixed: '#321300'
  on-secondary-fixed-variant: '#6f3810'
  tertiary-fixed: '#d9e2ff'
  tertiary-fixed-dim: '#b5c6f3'
  on-tertiary-fixed: '#051a3e'
  on-tertiary-fixed-variant: '#35466c'
  background: '#f7faf8'
  on-background: '#181c1b'
  surface-variant: '#e0e3e1'
  sage-deep: '#3E6B56'
  sage-surface: '#F0F6F3'
  apricot-deep: '#C85C38'
  apricot-surface: '#FEF4EE'
  lavender-surface: '#F2F5FB'
  status-safe-bg: '#EBF6F0'
  status-safe-text: '#2D684D'
  status-caution-bg: '#FFF7E8'
  status-caution-text: '#8C6116'
  status-danger-bg: '#FDF0EE'
  status-danger-text: '#A33B2E'
  status-hero-bg: '#F1EEF9'
  status-hero-text: '#544682'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
  numeric-metric:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  numeric-table:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.00em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 1.5rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-desktop: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a welcoming, clear, and reassuring administrative space for modern café owners, baristas, and hospitality managers. While conventional enterprise back-office software relies on sterile monochrome grids or harsh transactional contrasts, this design system translates the sensorial calmness of a specialty café interior into a cloud-native workspace.

### Brand Personality & Emotional Impact
- **Serene & Uncluttered:** Managing complex finances, ingredient wastage, and volatile inventory requires cognitive ease. The environment replaces analytical dread with visual serenity.
- **Warm Tactility:** Clean geometric SaaS architecture paired with gentle pastel tints creates an inviting atmosphere, like natural daylight on pale stone surfaces.
- **Dependable Precision:** Soft visuals do not sacrifice financial rigour. Ledger alignments, numeric weights, and operational state alerts maintain strict enterprise fidelity.

### Design Movement
- **Modern Soft-Minimalism with Pastel Toning:** Generous breathable negative space, delicate 1px borders, muted botanical sage tones, and soft apricot accents. Interfaces favor tinted white containers over heavy dark containers to minimize visual fatigue during long inventory shifts.

## Colors

The color palette centers around **Sage Mint (`#5B9279`)**, supported by **Pastel Apricot (`#F8A978`)** and **Soft Lavender Blue (`#7B8CB6`)**. Together, they soften dense financial tables and supply sheets without compromising WCAG AA text contrast thresholds.

### Primary, Secondary & Accent Tiers
- **Primary (`#5B9279` - Sage Mint):** The primary interaction anchor for confirmed flows, system tabs, primary action triggers, and positive metric graphs. Deep sage (`#3E6B56`) is enforced for textual accessibility on light containers.
- **Secondary (`#F8A978` - Pastel Apricot):** Illuminates attention-demanding elements, forecasted trends, active warnings, and secondary metrics. Its deep variant (`#C85C38`) guarantees legible contrast for labels.
- **Tertiary (`#7B8CB6` - Soft Lavender Blue):** Applied to auxiliary filters, analytics categorization, secondary chart series, and contextual meta-tags.

### Canvas & Surface Architecture
- **App Canvas (`#F4F7F5`):** A tinted, ultra-soft neutral backdrop that avoids harsh monitor glare.
- **Surface Pure (`#FFFFFF`):** Reserved for elevated cards, active table rows, and popovers.
- **Surface Inset / Tinted Containers (`#F0F6F3` / `#FEF4EE` / `#F2F5FB`):** Soft pastel sub-containers designed to visually organize nested metric sections, audit logs, and summary sidebars.
- **Outlines (`#E1E9E4` & `#D0DCD5`):** Subdued sage-gray borders that structure content without drawing focus from text.

### Operational Semantic Badges
Status chips discard aggressive neon primaries in favor of balanced pastel tints paired with high-contrast text:
- **안전 (Optimal / In-Stock):** Surface `#EBF6F0` with text `#2D684D`.
- **주의 (Low Stock / Inspection Needed):** Surface `#FFF7E8` with text `#8C6116`.
- **위험 (Stockout / Deficit):** Surface `#FDF0EE` with text `#A33B2E`.
- **효자메뉴 (Top Performer / Hero Item):** Surface `#F1EEF9` with text `#544682`.

## Typography

The typography leverages **Plus Jakarta Sans** for headlines and high-impact financial figures, bringing a warm, geometric roundness that matches the café aesthetic. **Manrope** provides a neutral, highly legible rhythm for tabular data, recipe cards, and multi-column input forms.

### Rules & Hierarchy
- **Tabular Alignment:** All numeric ledger elements (`numeric-table` and `numeric-metric`) must use `font-variant-numeric: tabular-nums lining-nums`. Quantities, currency symbols, and inventory weights must align cleanly down table columns.
- **Financial Units:** Suffixes such as "원", "g", "ml", and "pack" must appear in `body-sm` or `label-sm` weights using a muted tone (`#667870`) to prioritize the numeric value.
- **Caps & Micro-Tracking:** `label-sm` incorporates a gentle tracking increase (`0.03em`) to enhance legibility on small tablet displays and POS terminals.

## Layout & Spacing

The layout employs an 8-point spatial system designed for desktop dashboards, management tablets, and mobile views.

### Screen Adaptations
- **Desktop (1200px+):** 12-column layout with 24px (`gutter-desktop`) gutters and 32px (`margin-desktop`) padding. Sidebars default to a fixed 240px width with soft pastel panel borders.
- **Tablet (768px - 1199px):** 8-column layout with 20px (`gutter`) gutters and 24px (`margin`) margins. Sidebars collapse to an icon-rail, maximizing data table surface area.
- **Mobile (< 768px):** 4-column layout with 12px (`gutter-mobile`) gutters and 16px (`margin-mobile`) margins. Wide ledger tables switch to horizontally scrollable views with pinned first columns or card-based views.

### Density and Padding
- `space-xs` (4px) and `space-sm` (8px): Used for internal chip padding, badge icons, and input field spacing.
- `space-md` (16px) and `space-lg` (24px): Standard internal padding for cards, tables, and modal dialogues.
- `space-xl` (32px): Outer margins separating distinct analytical metric sections.

## Elevation & Depth

Visual hierarchy uses soft tonal surfaces and tinted ambient diffusion instead of harsh drop-shadows or stark borders.

### Surface Tiers
- **Canvas Base (Level 0):** `#F4F7F5`. Un-elevated base container.
- **Card & Table Panels (Level 1):** Solid `#FFFFFF` elevated over the canvas via a soft sage-tinted ambient shadow (`0 2px 8px -2px rgba(62, 107, 86, 0.06)`) and a 1px border in `#E1E9E4`.
- **Flyouts, Menus & Tooltips (Level 2):** Elevated `#FFFFFF` surface with a delicate multi-layer shadow (`0 8px 16px -4px rgba(62, 107, 86, 0.08), 0 2px 4px -1px rgba(62, 107, 86, 0.04)`) and a 1px border in `#D0DCD5`.
- **Modals & Drawers (Level 3):** Solid `#FFFFFF` complemented by a soft frosted veil (`backdrop-filter: blur(6px); background: rgba(30, 48, 40, 0.25)`). Elevated with a soft shadow (`0 20px 28px -6px rgba(45, 68, 56, 0.12)`).

## Shapes

The design uses a roundedness level of **2**, establishing a friendly, modern feel that softens analytical data without feeling overly casual.

### Corner Radii
- **Base Interactive Controls:** Standard buttons, input fields, and dropdowns use **0.5rem (8px)**.
- **Containers & Data Surfaces:** Metric cards, table surfaces, and dialogs use **1rem (16px)** (`rounded-lg`).
- **Pills & Status Indicators:** Status badges, notification counters, and filter tags use **9999px** full pills to stand out clearly from rectangular data cells.

## Components

### Buttons
- **Primary:** Solid Sage Mint (`#5B9279`) with white text and an 8px radius. Hover: `#4A7C66`. Active: `#3E6B56`.
- **Secondary (Pastel Apricot Tint):** Tinted Peach background (`#FEF4EE`), text `#C85C38`, with a 1px border in `#F8A978`. Hover: `#FDE8DC`.
- **Ghost / Tertiary:** Transparent background, text `#3E6B56`. Hover: `#F0F6F3`.

### Status Badges & Pills
- **Geometry:** Height 24px, 9999px pill border-radius, horizontal padding `8px`.
- **Variants:**
  - *안전 (Optimal):* `#EBF6F0` background, `#2D684D` text.
  - *주의 (Caution):* `#FFF7E8` background, `#8C6116` text.
  - *위험 (Deficit / Alert):* `#FDF0EE` background, `#A33B2E` text.
  - *효자메뉴 (Hero Item):* `#F1EEF9` background, `#544682` text.

### Data Tables
- **Header:** Background `#F0F6F3`, 1px bottom border `#E1E9E4`. Label styling: `label-sm`, text `#55685F`.
- **Row Styling:** Height 48px to 54px. White surface with an `#F4F7F5` hover transition. Dividers use `#EDF2EF`.
- **Alignment:** Aligns text left, status badges center, and inventory weights/financial totals right (`font-variant-numeric: tabular-nums`).

### Cards & Tinted Metric Displays
- **Container:** Pure `#FFFFFF` card, 16px radius, Level 1 shadow, 1px border `#E1E9E4`.
- **Sub-metrics (Tinted Containers):** Nested sections can adopt pastel-tinted cards (e.g., `#F0F6F3` for total profit, `#FEF4EE` for ingredient loss, `#F2F5FB` for coffee bean stock) to organize dashboard zones without visual clutter.

### Inputs & Selectors
- **Input Fields:** Height 40px, 8px radius, white fill, 1px border `#D0DCD5`. Focus ring: 2px solid `#5B9279` with a subtle 2px soft-tint spread (`rgba(91, 146, 121, 0.15)`).
- **Affix Addons:** Embedded measure units ("원", "kg", "shots") sit on an inset background (`#F4F7F5`) on the right edge, styled with `label-sm` in `#667870`.

### Selection Controls (Checkboxes & Radios)
- **Checkboxes:** 18px square with 4px corner radius. Unchecked: `#FFFFFF` with 1.5px border in `#CBD5D0`. Checked: `#5B9279` fill with white checkmark.
- **Radio Buttons:** 18px circle. Unchecked: `#FFFFFF` with 1.5px border in `#CBD5D0`. Checked: `#5B9279` ring containing a centered 8px solid Sage Mint circle.
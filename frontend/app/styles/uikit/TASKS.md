# NuvoUI UIKit - Build Contract

Component layer for NuvoUI. Born in aala.land, promoted to `@nuvoui/uikit` later.
Every rule here is binding. Invent nothing.

---

## 1. What this is

`@nuvoui/core` ships tokens, utilities and a thin element baseline.
This uikit ships **components**: button, badge, card, form, table, modal and the rest.

The uikit owns its own defaults. It never inherits visual decisions from core's
bare-element styles in `base/_base.scss`. If core changes or drops its `button`
rule, nothing here moves.

---

## 2. Naming

Prefix is `nu-`. BEM, PatternFly-flavoured.

```
.nu-btn                block
.nu-btn__icon          element   (double underscore)
.nu-btn.m-primary      modifier  (separate class, `m-` prefix)
.nu-btn.is-disabled    state     (separate class, `is-` prefix)
```

Rules:

- Block is always a single class: `.nu-btn`, `.nu-badge`, `.nu-card`.
- Elements are `__name`, always children of the block in markup.
- Modifiers are **separate classes** (`.m-primary`), never `--primary` suffixes.
  This is what lets `.nu-btn.m-primary.m-lg` compose without specificity fights.
- States use `is-` (`is-active`, `is-disabled`, `is-loading`, `is-open`).
- Never nest a modifier's styles under another block.
- Abbreviate the block only where the abbreviation is universal: `btn`. Otherwise
  spell it: `nu-badge`, `nu-card`, `nu-table`, `nu-modal`.

---

## 3. The mechanism (this is the important part)

Modifiers **reassign CSS variables** wherever the difference is a **value**:
colour, spacing, size, radius, shadow. The base rule is the only consumer.

Modifiers **may set properties directly** where the difference is **structural**
and no token could express it: `display`, `flex-direction`, `position`,
`list-style`, `overflow`, and the placement insets on floating components. If
you find yourself inventing a token whose only purpose is to be set by one
modifier, set the property instead.

Wrong:

```scss
.nu-btn.m-primary { background-color: var(--primary); }
```

Right:

```scss
.nu-btn {
  background-color: var(--nu-btn--BackgroundColor);
}
.nu-btn.m-primary {
  --nu-btn--BackgroundColor: var(--primary);
}
```

Why: variants compose, states stack, and consumers can retheme a single
component instance from outside without touching SCSS.

### Token naming

Component tokens: `--nu-{block}--{Property}` (PascalCase property).
Variant sub-tokens: `--nu-{block}--m-{variant}--{Property}`.
State sub-tokens: `--nu-{block}--{state}--{Property}`.

```
--nu-btn--BackgroundColor
--nu-btn--m-primary--BackgroundColor
--nu-btn--hover--BackgroundColor
--nu-btn__icon--MarginInlineEnd
```

### Declaration block

Every component declares all its tokens at the top of the block, defaulting to
core tokens. Use the `nu-root()` mixin from `mixins/_var.scss`.

---

## 4. Legal token sources

These are the ONLY values you may reference. Anything else is a violation.

### From @nuvoui/core (guaranteed to exist)

Color scales, auto-generated 50..950 plus a bare base:

```
--primary   --primary-50 ... --primary-950
--secondary --secondary-50 ... --secondary-950
--success   --success-50 ... --success-950
--danger    --danger-50 ... --danger-950
--warning   --warning-50 ... --warning-950
--info      --info-50 ... --info-950
```

Theme tokens (light-only in this app, `$enable-dark-mode: false`):

```
--bg-base  --bg-surface  --bg-alternate
--text-color  --text-muted  --text-subtle  --text-inverted
--border-base
```

Every theme token also has an `--inverted-{token}` twin.

### From uikit `common/_var.scss`

Spacing, radius, shadow, font-size, z-index and transition scales.
Read that file before using one. Do not add to it without saying so.

**These scales are ALIASES of NuvoUI core, not our own numbers.** `$nu-space`,
`$nu-font-size` and `$nu-font-weight` come straight from core's config;
`$nu-radius` maps our key names onto core's values. Never hardcode a number
into these maps: change core, or add an alias.

Core keys its maps with strings (`"2xl"`), call sites write them bare (`2xl`).
The lookup functions normalise, so keep writing them bare.

### Mixins: use core's, don't reimplement

`reduced-motion`, `media-up`, `media-down`, `media-between` and `dark-mode` are
re-exported from core through `mixins/_bem.scss`. Use those. Do not hand-write
a `@media (prefers-reduced-motion: reduce)` block.

### Two tooltip systems, deliberately

- `[data-tooltip]` (core): zero markup, pure CSS, text only. Use for simple
  labels on icon buttons.
- `.nu-tooltip` (kit): wraps markup, real arrow, tracked visibility, focus and
  Escape handling. Use for rich or stateful tooltips.

`tooltip.scss` points core's `--tooltip-*` vars at kit tokens so both look
identical. Do not "consolidate" them; they cover different needs.

### Verify, don't guess

The core source is readable. Before using any `var(--x)` you are not certain of,
open it and confirm:

```
node_modules/@nuvoui/core/src/styles/themes/_theme.scss        color + theme vars
node_modules/@nuvoui/core/src/styles/config/_colors.scss       palette config
node_modules/@nuvoui/core/src/styles/config/_theme-validation.scss  theme tokens
node_modules/@nuvoui/core/src/styles/base/_base.scss           element baseline
node_modules/@nuvoui/core/src/styles/functions/_colors.scss    scale generation
```

Do NOT read `mixins-map.scss`. It is large and irrelevant here.

App-level config lives in `app/styles/_nuvoui.scss`: brand primary is teal
`#1ab5a5`, dark mode is OFF, utility classes are ON.

### Scrims and overlays

Overlay backdrops use `nu-scrim($percent)`, never a brand color. `nu-tint(secondary, 50%)`
looks like a neutral grey in a mock and renders **blue** in this app, because
`$secondary` is `#0284c7`. That shipped once and had to be fixed across three
files. `nu-scrim()` is anchored to `--black` in **both** themes. It used to derive
from `--text-color`, which inverted it to a white wash under a dark theme because
core's dark theme sets `--text-color` near-white. A scrim is a dimming layer, not
a themed surface.

### Banned

- Inventing a CSS var. If `--bg-primary-soft` is not in `common/_var.scss` or the
  core list above, it does not exist. This is the exact bug that killed the first
  attempt.
- Hardcoded hex, rgb, or hsl anywhere in a component file. Colors come from
  tokens. If you need a translucent tint, use `color-mix()` against a token.
- `!important`.
- `@include Nuvo.apply(...)` inside component internals. `apply()` is for app
  authoring, not library internals. Library CSS is written as plain declarations
  so the output is auditable.
- Bare-element selectors (`button { }`). Components are classes.
- Nesting deeper than 2 levels.
- Fixed `px` for spacing. Use the spacing scale. `px` is allowed for hairline
  borders and deliberate optical sizes (icon boxes), and nowhere else.

---

## 5. Variants: loop or enumerate

**Loop** when variants differ only in which token they point at. Colors, sizes.

```scss
@each $variant in (primary, secondary, success, warning, danger, info) {
  .nu-badge.m-#{$variant} {
    --nu-badge--Color: var(--#{$variant}-700);
    --nu-badge--BackgroundColor: var(--#{$variant}-50);
    --nu-badge--BorderColor: var(--#{$variant}-200);
  }
}
```

**Enumerate** when variants differ in shape, not just colour. Button `m-primary`
vs `m-secondary` vs `m-ghost` differ in border and background strategy, so they
are written out.

Never hand-repeat a block that a loop expresses. That is the badge-count bug:
six variants existed, two were written.

---

## 6. File template

```scss
// nu-{block} - one line saying what it is
@use "sass:map";
@use "./mixins/var" as *;
@use "./common/var" as *;

.nu-btn {
  @include nu-root("btn", (
    "Display": inline-flex,
    "BackgroundColor": var(--primary),
    // ... every token this component consumes
  ));

  // base rule: consumes variables only
  display: var(--nu-btn--Display);
  background-color: var(--nu-btn--BackgroundColor);

  // elements
  &__icon { ... }

  // modifiers: reassign variables only
  &.m-primary { --nu-btn--BackgroundColor: var(--primary); }

  // states
  &.is-disabled { ... }
}
```

Order inside a file, always: tokens, base declarations, elements, modifiers,
states, responsive.

---

## 7. Accessibility, non-negotiable

- Never `outline: none` without a replacement. Every interactive component gets a
  visible `:focus-visible` ring driven by `--nu-{block}--focus--BoxShadow`.
- Interactive targets are at least 32px in the smallest size, 40px default.
- Disabled uses `is-disabled` plus real `[disabled]`, and must not rely on colour
  alone.
- Respect `prefers-reduced-motion` wherever a transition runs.

---

## 8. Verification, per component

A component is done when all four pass:

1. `npx sass --load-path=node_modules app/styles/app.scss` compiles clean.
2. Emitted CSS contains every selector the file claims to ship.
3. No banned pattern present. Grep for hex codes, `!important`, `apply(`.
4. Every `var(--x)` used resolves to something in section 4.

---

## 9. Component inventory

Source column is where the prior extraction lives. Read it for **what classes and
states exist**, then rewrite to this contract. Do not copy its structure.

Legend: R = reference implementation (hand-built), A = agent-built.

| # | Component | File | Source | Who |
|---|-----------|------|--------|-----|
| 1 | Tokens + engine | `mixins/_bem.scss`, `mixins/_var.scss`, `common/_var.scss` | new | R |
| 2 | Button | `button.scss` | `uikit-old/button.scss` | R |
| 3 | Badge | `badge.scss` | `uikit-old/badge.scss`, `uikit-test/1-atoms/_badges.scss` | R |
| 4 | Card | `card.scss` | `uikit-old/card.scss` | R |
| 5 | Form | `form.scss` | `uikit-old/form.scss` | R |
| 6 | Table | `table.scss` | `uikit-old/table.scss` | A |
| 7 | Modal | `modal.scss` | `uikit-old/modal.scss` | A |
| 8 | Sidebar | `sidebar.scss` | `uikit-old/sidebar.scss` | A |
| 9 | Topbar | `topbar.scss` | `uikit-old/topbar.scss` | A |
| 10 | Tabs | `tabs.scss` | `uikit-old/tabs.scss` | A |
| 11 | Kanban | `kanban.scss` | `uikit-old/kanban.scss` | A |
| 12 | Alert | `alert.scss` | `uikit-old/alert.scss` | A |
| 13 | Toast | `toast.scss` | `uikit-old/toast.scss` | A |
| 14 | Progress | `progress.scss` | `uikit-old/progress.scss` | A |
| 15 | Timeline | `timeline.scss` | `uikit-old/timeline.scss` | A |
| 16 | Tag | `tag.scss` | `uikit-old/tags.scss` | A |
| 17 | Dot | `dot.scss` | `uikit-old/dot.scss` | A |
| 18 | Page header | `page-header.scss` | `uikit-old/page-header.scss` | A |
| 19 | Empty state | `empty-state.scss` | `uikit-old/empty-state.scss` | A |
| 20 | Dropdown | `dropdown.scss` | `uikit-test/components/action-dropdown.scss` | A |
| 21 | Toggle | `toggle.scss` | `uikit-test/1-atoms/_toggles.scss` | A |
| 22 | Avatar | `avatar.scss` | grep templates | A |

Built after this table was written and not listed above: accordion, breadcrumb,
code-block, core-bridge, divider, drawer, list, pagination, panel, popover,
segmented, skeleton, timeline, title, tooltip.

`uikit-old/base.scss` is NOT ported. Base element styling is core's job.

`utilities.scss` IS ported, against the original rule. Core ships only physical
alignment and margin utilities (`.text-right`, `.ml-*`), which pin to the
viewport rather than the reading direction. The kit fills that one gap and
nothing more. See the header of that file.

### Every entry pairs a stylesheet with a component

A stylesheet with no component is a page style, not a kit entry. `kanban.scss`
was demoted to `styles/pages/` for exactly that reason. The standing exceptions
are `form.scss` (backs input, select, checkbox, radio, textarea, field),
`utilities.scss`, `core-bridge.scss`, and `table.scss` and `code-block.scss`,
which are consumed as raw markup by design.

---

## 10. Legacy class usage (from templates, live grep)

The app currently uses these. They inform **what states must exist**, not what
they must be called. New markup uses `nu-` names.

```
btn (139)  btn-secondary (69)  btn-primary (46)  btn-xs (43)  btn-sm (24)  btn-danger (17)
glass-panel (78)  status-badge (32)  form-input (41)  type-badge (15)
data-table (22)  data-table-wrapper (20)  form-group (12)
kpi-card (8)  kpi-label (11)  kpi-value (8)  kpi-icon-wrap (8)
page-header (9)  page-title (10)  page-subtitle (9)  alert (9)
```

Utility classes (`flex`, `gap-2`, `text-muted`, `col`, `font-sm`) come from core
and are untouched.

---

## 11. Agent rules

- One component per agent. Do not touch another component's file.
- Do not edit `mixins/`, `common/`, or `index.scss`. If you need a token that is
  not there, stop and report it. Do not add it yourself.
- Read `button.scss` and `badge.scss` first. They are the reference. Match them.
- Read your source file for inventory only. Its structure is not a model.
- Report: classes shipped, tokens declared, anything in the source you dropped
  and why, anything you needed that did not exist.

# NuvoUI Ember UIKit - Build Plan

Glimmer component layer over the SCSS uikit, plus a `/uikit` showcase route.
This becomes the public presentation for `@nuvoui/ember-uikit`.

Status: PLAN ONLY. Nothing built yet.

---

## 1. What exists already (read this before touching anything)

**SCSS layer:** `app/styles/uikit/` - 33 components, `nu-` BEM, done and verified.
Contract in `TASKS.md`.

**Ember layer that exists:** `app/components/ui/` - 9 components, 702 lines,
in active use (FormInput 94 uses, AppButton 42, Modal 31, Pagination 17, Tabs 5).

AAMIR's ruling: this folder is throwaway, built haywire. `components/uikit/` is
the correct home. Build fresh there. `ui/` stays untouched and keeps the app
running until screens migrate; nothing in the new kit depends on it.

### Salvage list (the only things worth lifting out of `ui/`)

| From | What | Where it goes |
|---|---|---|
| `pagination.js` | page/limit/total math, `totalPages`, `disablePrevious`/`disableNext`, per-page option list with `selected` flag | `nu-pagination` logic, near verbatim |
| `form-dropdown.js` | click-outside via `registerDestructor`, group-contiguity sort so keyboard order matches visual order, `showSearch` threshold, highlighted-index keyboard nav, in-modal position detection | `nu-dropdown` / `nu-select` - the hardest logic in the folder, do not rewrite from scratch |
| `toast-container.js` | service-driven toast queue shape | `nu-toast` region |

Everything else (`app-button`, `form-input`, `form-textarea`, `modal`, `tabs`,
`ph`) is thin class-string wrapping over legacy `btn`/`form-input` vocabulary.
Rewrite, do not port.

---

## 2. What Element Plus does that we do not

Read from `/Users/aamir/Projects/ember-element-ui/addon/components/*.js|hbs`.
These are the "small things" worth stealing.

### Icon placement (the thing AAMIR specifically named)

Element's button takes `@icon` and always renders it BEFORE the label, adding
a margin class only when there IS a label:

```hbs
{{svg-jar this.icon class=(concat this.iconClass (if (has-block) ' m-l-0 m-r-10'))}}
{{#unless @circle}}{{yield}}{{/unless}}
```

We need better: `@iconStart` / `@iconEnd` as separate args, or `@icon` +
`@iconPosition="end"`. Element cannot put an icon after the text at all.

### Loading state folded into icon

`get icon() { return this.args.loading ? 'loading' : this.args.icon }` and the
icon class gains `is-rotating`. One slot, two meanings. Also `loading` implies
`disabled`. We should copy this exactly.

### Circle buttons suppress the label

`{{#unless @circle}}{{yield}}{{/unless}}` - the yielded content is DROPPED for
icon-only circle buttons. Neat, prevents broken layout.

### Badge value formatting

```js
if (typeof value === 'number' && typeof max === 'number') {
  return max < value ? `${max}+` : value;
}
```
`@value=120 @max=99` renders `99+`. We have no such logic.

Also `isShow` treats `0` as displayable (`this.content === 0`) but hides on
null/undefined. That zero-check is the kind of detail that gets missed.

### `has-block` driving layout

Badge adds `is-fixed` ONLY when it wraps something (`{{if (has-block) "is-fixed"}}`).
Standalone badge = inline pill, wrapping badge = absolutely positioned corner
bubble. Same component, two behaviours, decided by whether a block was passed.
Our SCSS has both but no component logic to pick.

Alert does the same: block content wins, else `@title`.

### Alert icon size depends on description presence

`isBigIcon` = description present, `isBoldTitle` = description absent. Layout
responds to what data you gave it.

### Input: hover-revealed clear button

```js
get showClear() {
  return this.clear && !disabled && !readonly && value !== '' && this.isHovering;
}
```
Clear "x" appears only on hover, and only when there is a value. Tracked
`isHovering` via mouseenter/mouseleave. We have no clearable input.

### Input prepend/append forms a group

`get _isGroup() { return !!(this.prepend || this.append) }` - the wrapper class
changes when addons exist. Our SCSS has `nu-input-group` but nothing decides.

### Checkbox group parent coordination

Checkbox reads `@parent` for size, disabled, and min/max selection limits:
```js
get isLimitDisabled() {
  return (parent.max && model.length >= parent.max && !isChecked) ||
         (model.length <= parent.min && isChecked);
}
```
Enforcing "pick 2 to 4" at the item level. Worth copying for checkbox-group.

### Defensive arg validation

Every component whitelists its variants and falls back:
```js
if (['primary','success','warning','info','danger','text'].indexOf(color) === -1) {
  color = this.defaultColor;
}
```
A typo renders the default instead of an unstyled element. Cheap, prevents
silent breakage. Should be standard in ours.

### Things Element does that we should NOT copy

- `el-switch` and `el-progress` are old `Component.extend` with `htmlSafe`
  inline styles. Ember 6.4 + Glimmer only. Rewrite, do not port.
- Alert/tag closing hardcodes `animate__animated animate__fadeOut` (animate.css
  dependency) and listens for a transition event to set state. Fragile. Use CSS
  transitions our SCSS already defines.
- `el-progress` hardcodes hex colors (`#13ce66`, `#ff4949`). Our tokens handle this.
- `el-checkbox` is half-commented-out dead code. Do not use as reference.

---

## 3. Component inventory to build

Under `app/components/uikit/`. Namespace `Uikit::`.

Wave 1 - atoms, no dependencies:
| Component | SCSS | Key args |
|---|---|---|
| `nu-button` | button.scss | variant, size, icon, iconPosition, loading, disabled, block, circle, outline, onClick |
| `nu-badge` | badge.scss | variant, value, max, isDot, hidden, solid, outline, pill, size |
| `nu-tag` | tag.scss | variant, size, closable, outline, onClose |
| `nu-dot` | dot.scss | variant, size, pulse, ring |
| `nu-avatar` | avatar.scss | src, alt, initials, icon, size, square, status |
| `nu-spinner` | progress.scss | variant, size |
| `nu-divider` | divider.scss | vertical, dashed, label, labelPosition |
| `nu-skeleton` | skeleton.scss | shape, width, lines |

Wave 2 - form controls (need value binding):
| Component | SCSS | Key args |
|---|---|---|
| `nu-input` | form.scss | value, type, size, placeholder, disabled, readonly, clearable, prefixIcon, suffixIcon, prepend, append, invalid, onInput, onChange |
| `nu-textarea` | form.scss | value, rows, autosize, resize, maxlength |
| `nu-select` | form.scss | value, options, placeholder, disabled, size |
| `nu-checkbox` | form.scss | checked, label, value, disabled, indeterminate, onChange |
| `nu-checkbox-group` | form.scss | value, min, max, disabled, size, onChange |
| `nu-radio` / `nu-radio-group` | form.scss | value, options, name |
| `nu-toggle` | toggle.scss | checked, variant, size, disabled, activeText, inactiveText, onChange |
| `nu-field` | form.scss | label, required, hint, error, horizontal |

Wave 3 - containers and feedback:
| Component | SCSS | Key args |
|---|---|---|
| `nu-card` | card.scss | title, subtitle, flush, compact, flat, raised, interactive, accent |
| `nu-stat` | card.scss | label, value, delta, icon, variant |
| `nu-alert` | alert.scss | variant, title, description, showIcon, closable, inline, banner, onClose |
| `nu-progress` | progress.scss | value, variant, size, indeterminate, striped, showText |
| `nu-empty-state` | empty-state.scss | icon, title, description |
| `nu-panel` | panel.scss | title, flush, compact, raised |
| `nu-toolbar` | panel.scss | sticky, bordered |

Wave 4 - interactive / stateful:
| Component | SCSS | Key args |
|---|---|---|
| `nu-modal` | modal.scss | open, title, size, scrollable, closeOnBackdrop, onClose |
| `nu-drawer` | drawer.scss | open, placement, size, title, onClose |
| `nu-dropdown` | dropdown.scss | placement, items, onSelect |
| `nu-tabs` | tabs.scss | tabs, activeTab, variant, vertical, fill, onChange |
| `nu-accordion` | accordion.scss | items, multiple, bordered, flush |
| `nu-tooltip` | tooltip.scss | content, placement, light |
| `nu-popover` | popover.scss | title, content, placement, open |
| `nu-pagination` | pagination.scss | page, perPage, total, onPageChange |
| `nu-breadcrumb` | breadcrumb.scss | items |
| `nu-table` | table.scss | columns, rows, striped, bordered, compact, stickyHead, sortBy, onSort |

Wave 5 - app shell (lower priority, aala-specific):
sidebar, topbar, kanban, timeline, page-header, toast, list, title/text, code-block.

---

## Status as of 2026-08-02

ATOMS + FORM TIER: DONE. 21 components, browser-verified.
See CONVENTIONS.md for the binding rules every component follows.

### Decisions (AAMIR)

- **Everything stays inline in `app/components/uikit/`.** Flat folder, `Uikit::`
  namespace. No sub-foldering by tier.
- **Table: use Ember Table.** We do NOT build a table component. `table.scss`
  already ships the full layout surface (nu-table, nu-table-wrapper, m-striped,
  m-bordered, m-compact, m-comfortable, m-sticky-head, __footer, sortable/
  selected/hoverable row states). Job is to make Ember Table render INTO those
  classes, not to reimplement it.
- **Modal: we build our own.** nu-modal + nu-backdrop SCSS is ready.
- **Calendar / date picker / time picker: PARKED.** No SCSS exists for any of
  them. Revisit later; do not start speculatively.

### Next tier: containers, then overlays

Containers (presentational, fast):
| Component | SCSS block(s) | File |
|---|---|---|
| nu-card | card | card.scss |
| nu-stat | stat | card.scss |
| nu-list-item | list-item | card.scss |
| nu-info-row | info-row | card.scss |
| nu-alert | alert | alert.scss |
| nu-empty-state | empty-state | empty-state.scss |
| nu-panel / nu-toolbar | panel, toolbar | panel.scss |
| nu-page-header | page-header | page-header.scss |
| nu-skeleton | skeleton, skeleton-group | skeleton.scss |
| nu-title / nu-text | title, text | title.scss |
| nu-list / nu-desc-list | list, desc-list | list.scss |
| nu-code / nu-code-block / nu-clipboard-copy | code, code-block, clipboard-copy | code-block.scss |

Overlays and stateful (the real work):
| Component | SCSS block(s) | Notes |
|---|---|---|
| nu-modal | modal, backdrop | own build; focus trap, ESC, backdrop dismiss |
| nu-drawer | drawer, drawer-backdrop | same mechanics, edge placement |
| nu-tabs | tabs | active state, keyboard nav |
| nu-accordion | accordion | expand/collapse, multiple vs single |
| nu-tooltip | tooltip | hover/focus trigger, placement |
| nu-popover | popover | click trigger, click-outside (reuse nu-dropdown pattern) |
| nu-breadcrumb | breadcrumb | presentational |
| nu-pagination | pagination | salvage page math from ui/pagination.js |
| nu-toast + service | toast, toast-region | queue service, auto-dismiss |

---

## 4. Conventions every component must follow

Match the existing codebase (`app/components/ui/*.js`), not Element.

- Glimmer only: `import Component from '@glimmer/component'`. Never `Component.extend`.
- Co-located `.hbs` + `.js`. `.js` omitted entirely when there is no logic.
- `@tracked` for internal state, `@action` for handlers.
- Optional callbacks invoked as `this.args.onFoo?.()` - matches confirm-modal.js.
- `...attributes` on the root element, ALWAYS, so callers can pass class/data-test.
- Class strings built in a getter, never inline in the template.
- Whitelist every variant arg and fall back to a default (Element's pattern).
- `data-test-*` attributes on every interactive element (project rule 7).
- No inline styles except genuinely dynamic values (progress width, avatar src).
- Never emit legacy `btn`/`badge` classes. `nu-` vocabulary only.

### Class-building pattern (canonical)

```js
get classes() {
  const parts = ['nu-btn'];
  const variant = ['primary','secondary','success','warning','danger','info','ghost','link']
    .includes(this.args.variant) ? this.args.variant : null;
  if (variant) parts.push(`m-${variant}`);
  if (['xs','sm','lg'].includes(this.args.size)) parts.push(`m-${this.args.size}`);
  if (this.args.outline) parts.push('m-outline');
  if (this.isDisabled) parts.push('is-disabled');
  return parts.join(' ');
}
```

---

## 5. The `/uikit` showcase route

`app/routes/uikit.js`, `app/templates/uikit.hbs`, `app/controllers/uikit.js`.
Registered in `router.js` as a top-level route.

Requirements:
- One section per component, anchored, with a sticky in-page nav.
- Every section shows: live examples of all variants/sizes/states, plus the
  invocation snippet as copyable code.
- Interactive things must actually work (modal opens, tabs switch, toggle flips,
  toast fires, accordion expands, pagination pages).
- A theme switcher demonstrating that changing `--primary` reskins everything,
  which is the whole point of the variable mechanism.
- No auth required. This is a public presentation surface.

---

## 6. Execution

1. I build `nu-button` + `nu-input` by hand as reference components, plus the
   `/uikit` route skeleton and one showcase section. Build + browser verified.
2. Sonnet agents (pinned) take remaining waves, one wave per agent, given:
   the two reference components, this plan, the SCSS file they target, and the
   conventions in section 4.
3. Each agent writes component + showcase section + integration test.
4. I verify: `ember build` clean, tests pass, then headed browser walkthrough
   of `/uikit` clicking every interactive control.

`components/ui/` is not modified at any point. It dies later, by attrition, once
screens have moved to `Uikit::`.

Verification gate per component: builds, renders, emits the expected `nu-`
classes, interactive behaviour works in a real browser, has a test.

# Uikit Glimmer components - binding conventions

Read this plus `wu-button.js/hbs` and `wu-input.js/hbs` before writing anything.
Those two are the reference. Match them.

SCSS lives in `styles/<name>.scss` inside this package. Read the one you are wrapping to
learn the exact class names. **Never invent a class.** If the style you need does
not exist, stop and report it; do not add SCSS.

## Rules

- `import Component from '@glimmer/component'`. Never `Component.extend`.
- Co-located `.hbs` + `.js`. Omit the `.js` entirely if there is no logic.
- `@tracked` for internal state, `@action` for handlers.
- Optional callbacks: `this.args.onFoo?.(value)`. Never assume they exist.
- `...attributes` on the root element, ALWAYS, and place it LAST so callers can
  override. This lets tests and callers pass `class`/`data-test-*`.
- Class strings are built in a `get classes()` getter. Never inline in template.
- Whitelist every variant/size arg against a const array and fall back silently:
  a typo must render the default, never an unstyled element.
- `data-test-<name>` on the root and on every interactive child.
- No inline `style` except genuinely dynamic values (progress width, avatar url).
- Never emit legacy `btn` / `badge` / `form-input` classes. `wu-` only.
- Boolean args: coerce with `Boolean(...)` when the result is used in a class.

## Canonical class getter

```js
const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['sm', 'lg'];

get classes() {
  const parts = ['wu-badge'];
  if (VARIANTS.includes(this.args.variant)) parts.push(`m-${this.args.variant}`);
  if (SIZES.includes(this.args.size)) parts.push(`m-${this.args.size}`);
  if (this.args.outline) parts.push('m-outline');
  if (this.args.disabled) parts.push('is-disabled');
  return parts.join(' ');
}
```

## Behaviours worth copying from Element Plus

These are the details that make a kit feel finished. Apply where relevant.

- **Loading folds into the icon slot.** `loading ? loadingIcon : icon`, add the
  spin class, and `loading` implies `disabled`. See `wu-button.js`.
- **`has-block` changes layout.** A badge standing alone is an inline pill; a
  badge wrapping content is a corner bubble (`wu-badge-wrap` + `is-fixed`).
  Use `{{#if (has-block)}}` to decide.
- **`@max` overflow.** `@value=120 @max=99` renders `99+`. Note `0` must still
  display; only null/undefined hides.
- **Hover-revealed affordances.** Clear buttons appear on hover AND only when
  there is a value. See `wu-input.js` `showClear`.
- **Layout responds to data.** Alert icon grows (`is-large`) when a description
  exists; title-only alerts keep the small centred icon.
- **Group parents coordinate children.** A checkbox-group passes size/disabled
  down and enforces min/max selection at the item level.

## Tooltips

There is exactly one tooltip mechanism. Do not build a second one, and do not
add a per-instance tooltip component.

Add `data-tooltip="..."` to any element. That is the whole API.

```hbs
<Woven::Button @icon="plugs" aria-label="Re-pair" data-tooltip="Re-pair device" />
```

Optional: `data-tooltip-position="top|bottom|start|end"` (default `top`,
`start`/`end` are logical and swap under RTL), and `data-tooltip-light`.

`Woven::TooltipHost` is mounted once in `application.hbs`. It installs delegated
listeners on `document` and renders a single positioned element **only while a
tooltip is shown**, destroying it on hide. So a trigger costs zero extra DOM
nodes and zero event listeners, and an idle page carries no tooltip DOM at all.
Measured: 10,000 triggers on one page render 0 tooltip nodes idle, 1 while
shown, 0 after mouseout. This is why a table with 1,000 rows is fine.

Rules:

- **Never write `role="tooltip"` on a trigger.** It replaces the element's own
  role, so a button stops announcing as a button. The host owns that role.
  WovenUI core ships a pure-CSS `[data-tooltip][role~="tooltip"]` tooltip; because
  nothing here writes that role, core never matches and cannot double-render.
- **`aria-describedby` is automatic.** The service sets it on the trigger while
  visible and removes it on hide. Do not hand-write it.
- **`aria-label` only when the element has no accessible name of its own**, ie.
  an icon-only button. It replaces the *name*; a tooltip is a *description*. On
  a labelled control it would overwrite the label and lose what the control is.
- **Wrap a disabled trigger.** `.wu-btn:disabled` sets `pointer-events: none`,
  so no event reaches delegation. Put `data-tooltip` on a wrapping `<span>`.
- **Content is read at hover time**, so state-dependent text needs no special
  handling. Text only; the attribute cannot carry markup.

## Anchored layer (dropdown menus, popovers)

There is exactly one mechanism for floating panels that must not be clipped.
Do not position a menu inside its trigger's subtree with `position: absolute`;
any ancestor with `overflow`, a `mask-image` or a `transform` (every drawer)
clips or re-anchors it.

- `Woven::LayerHost` is mounted once in `application.hbs`, after modals and
  drawers and before `Woven::TooltipHost`, so menus paint above dialogs and
  tooltips paint above menus. The `layer` service exposes its element (with a
  body-level fallback for rendering tests).
- The panel renders inside `{{#if isOpen}}{{#in-element this.layer.element
  insertBefore=null}}` (mount on open, zero idle DOM, entry fade only) and
  carries the `anchor` modifier: `{{anchor trigger placement=.. align=.. gap=..
  matchWidth=.. onDismiss=..}}`. Placement is logical (`top|bottom|start|end`),
  resolved against the trigger's computed direction; the modifier writes fixed
  coordinates, flips when the preferred side does not fit, clamps to the
  viewport, sets `data-placement` (physical) and `--wu-anchor--ArrowX/Y`, and
  dismisses on outside scroll or resize.
- The panel is outside the component root, so: click-outside checks both root
  and panel; keydown is bound on the panel too; Escape stops propagation (a
  drawer underneath stays open); `close()` returns focus to the trigger;
  queries for menu children go through the panel element, never the root.
- Tests select the panel from `document`, not the component subtree.

## Icons

The kit never renders a host app's icon component. It ships `Woven::Icon`, a thin
wrapper over the Phosphor web font, which the host must load.

Components that show a caller-controlled icon take a named `:icon` block. The
block wins when given; `@icon="name"` stays the default path, so existing call
sites need no change.

```hbs
<Woven::Button @icon="trash" @text="Delete" />

<Woven::Button>
  <:icon><MyOwnIcon /></:icon>
  <:default>Delete</:default>
</Woven::Button>
```

- `Woven::Button` forwards `:icon` through all three tag modes (button, anchor,
  `LinkTo`). `@loading` still wins over a supplied block, so the spinner is never
  replaced by a caller's icon.
- `Woven::Tabs` and `Woven::Segmented` draw icons from a data array, so their block
  yields the item back: `<:icon as |tab|>` and `<:icon as |option|>`.

Field's question glyph and ToastRegion's dismiss glyph are internal chrome, not
caller-controlled, and have no slot.

## Right-to-left

The kit runs under `<html dir="rtl">` with no per-use changes. Two layers, each
RTL on its own: the SCSS (shipped as the HTML/CSS kit) and the components.

- **SCSS: logical properties only** (`inset-inline-*`, `margin-inline-*`,
  `padding-inline-*`, `border-inline-*`, `text-align: start/end`). Never
  `left`/`right`, except under a class that is already physical
  (`.wu-tooltip.m-left`, chosen by the host after resolving start/end).
- **Transforms are physical.** A logical inset plus `translateX(-50%)` breaks in
  RTL. Centre an element smaller than its box with `inset: 0; margin: auto`;
  centre a larger one (hit areas) with `inset-*-start: calc(50% - size / 2)`;
  otherwise flip the sign under `[dir="rtl"] &` (drawer, badge, popover).
  Negative auto margins do not split evenly, so `margin: auto` cannot centre
  an element wider than its container.
- **`[dir="rtl"] &` is the override idiom.** Mind specificity: an override on
  a modifier can outrank a later state rule (`.is-open`). Prefer a sign
  multiplier variable (`--wu-drawer--Dir`) over re-setting the state's value.
- **Sweeps and glyphs.** X-axis keyframes get a mirrored twin or
  `animation-direction: reverse`. Glyphs that are not bidi-mirrored (`▸`,
  Phosphor `*-left`/`*-right`) get `scaleX(-1)` in RTL; `Woven::Icon` adds
  `flip-rtl` automatically for names containing left/right, `@flip` overrides.
- **Arrow keys follow the reading direction.** Horizontal ArrowLeft/ArrowRight
  handlers read `document.documentElement.dir` (tabs, segmented).
- **Data that stays LTR.** `Woven::Input` sets `dir="ltr"` for `tel`, `number`,
  `email` and `url`; code blocks are pinned to `direction: ltr`; `Woven::Badge`
  wraps count values and capped numbers (`99+`) in `<bdi dir="ltr">`, while text
  labels keep their own direction.
- **Verify on `/woven`** with the Dir switch, in both directions.

## Validation

`Woven::Field` owns the wiring between a control, its label and its message. A
template passes state to the Field; the Field writes the ARIA onto the control.

- **Status vocabulary.** `@status` is `error`, `warning` or `success`.
  `@invalid` aliases `error`, `@valid` aliases `success`, and a non-empty
  `@error` on a Field or FieldGroup implies `error`. Unknown values render no
  status. Input, Textarea, Select, Checkbox, Radio, Toggle, Dropdown and
  Autocomplete accept the same arguments; an argument on the control wins over
  the Field around it.
- **What the Field writes**, reactively, onto the control: `aria-invalid="true"`
  while the status is `error`; `aria-describedby` with the hint id, the error id,
  then any id already there; `aria-required="true"` with `@required`; and
  `data-wu-field-status` for the warning and success styles. Styles key on
  `[aria-invalid="true"]` and `.is-invalid`, never on a class alone, so the red
  state cannot drift from what assistive technology hears.
- **Message slot.** Every Field and FieldGroup renders `.wu-field__message`,
  reserving one line of message text (`--wu-field--MessageMinHeight`, from the
  type scale) whether or not there is a message. It is `aria-live="polite"`.
  The error replaces the hint and always carries an icon.
- **Groups.** Radio and checkbox sets use `Woven::FieldGroup` (`<fieldset>` +
  `<legend>`), not a Field. Its status reaches every control inside it.
- **Label modes.** `@label` renders a static label above the control.
  Without `@label`, `@placeholder` renders a floating label inside the control
  that rises on focus or once there is a value; the native placeholder becomes a
  single space. Pass the yielded `placeholder` to a Select or Autocomplete.
  Format examples go in `@hint`, because a floated label leaves no room for them.
- **Message wording.** Say what is wrong and how to fix it, in sentence case,
  without blaming the user: "Enter a rent greater than 0", not "Invalid value"
  or "Error!". Name the field's own words ("Choose a region"), keep it to one
  line, and end without a period.
- **Not every input is a Field.** Toolbar search boxes, inline filters and
  composers stay bare controls with `aria-label` and no reserved slot.
- **Form container.** Wrap fields in `.wu-form`; fields sit `--wu-form--Gap` apart because each Field's message line is the spacing, and any other child (actions, dividers, alerts) gets `--wu-form--SectionGap`.

## Showcase

Every component gets a section appended to `app/templates/uikit.hbs`:

```hbs
<section class="uikit-section" id="badge">
  <h2 class="uikit-section__title">Badge</h2>
  <div class="uikit-row">
    ...all variants...
  </div>
</section>
```

Use `.uikit-row` for horizontal groups, `.uikit-stack` for vertical.
Interactive components must actually work on the page (state lives in
`app/controllers/uikit.js`).

## Verification (required, not optional)

```
cd frontend
pnpm --filter @wovenui/ember build
pnpm exec vite build --mode development
```

The kit build comes first; without it the app compiles against a stale `dist/`.

Must exit clean. Then confirm your component's classes appear in the built
output and that you invented no class names not present in the SCSS file.

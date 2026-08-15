# Uikit Glimmer components - binding conventions

Read this plus `nu-button.js/hbs` and `nu-input.js/hbs` before writing anything.
Those two are the reference. Match them.

SCSS lives in `app/styles/uikit/<name>.scss`. Read the one you are wrapping to
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
- Never emit legacy `btn` / `badge` / `form-input` classes. `nu-` only.
- Boolean args: coerce with `Boolean(...)` when the result is used in a class.

## Canonical class getter

```js
const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['sm', 'lg'];

get classes() {
  const parts = ['nu-badge'];
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
  spin class, and `loading` implies `disabled`. See `nu-button.js`.
- **`has-block` changes layout.** A badge standing alone is an inline pill; a
  badge wrapping content is a corner bubble (`nu-badge-wrap` + `is-fixed`).
  Use `{{#if (has-block)}}` to decide.
- **`@max` overflow.** `@value=120 @max=99` renders `99+`. Note `0` must still
  display; only null/undefined hides.
- **Hover-revealed affordances.** Clear buttons appear on hover AND only when
  there is a value. See `nu-input.js` `showClear`.
- **Layout responds to data.** Alert icon grows (`is-large`) when a description
  exists; title-only alerts keep the small centred icon.
- **Group parents coordinate children.** A checkbox-group passes size/disabled
  down and enforces min/max selection at the item level.

## Tooltips

There is exactly one tooltip mechanism. Do not build a second one, and do not
add a per-instance tooltip component.

Add `data-tooltip="..."` to any element. That is the whole API.

```hbs
<Nuvo::Button @icon="plugs" aria-label="Re-pair" data-tooltip="Re-pair device" />
```

Optional: `data-tooltip-position="top|bottom|start|end"` (default `top`,
`start`/`end` are logical and swap under RTL), and `data-tooltip-light`.

`Nuvo::TooltipHost` is mounted once in `application.hbs`. It installs delegated
listeners on `document` and renders a single positioned element **only while a
tooltip is shown**, destroying it on hide. So a trigger costs zero extra DOM
nodes and zero event listeners, and an idle page carries no tooltip DOM at all.
Measured: 10,000 triggers on one page render 0 tooltip nodes idle, 1 while
shown, 0 after mouseout. This is why a table with 1,000 rows is fine.

Rules:

- **Never write `role="tooltip"` on a trigger.** It replaces the element's own
  role, so a button stops announcing as a button. The host owns that role.
  NuvoUI core ships a pure-CSS `[data-tooltip][role~="tooltip"]` tooltip; because
  nothing here writes that role, core never matches and cannot double-render.
- **`aria-describedby` is automatic.** The service sets it on the trigger while
  visible and removes it on hide. Do not hand-write it.
- **`aria-label` only when the element has no accessible name of its own**, ie.
  an icon-only button. It replaces the *name*; a tooltip is a *description*. On
  a labelled control it would overwrite the label and lose what the control is.
- **Wrap a disabled trigger.** `.nu-btn:disabled` sets `pointer-events: none`,
  so no event reaches delegation. Put `data-tooltip` on a wrapping `<span>`.
- **Content is read at hover time**, so state-dependent text needs no special
  handling. Text only; the attribute cannot carry markup.

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
cd /Users/aamir/Projects/aala.land/Main/frontend
npx ember build --environment=development
```

Must exit clean. Then confirm your component's classes appear in the built
output and that you invented no class names not present in the SCSS file.

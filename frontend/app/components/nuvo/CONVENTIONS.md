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

# Page Migration Brief

You are migrating ONE page off legacy CSS onto the NuvoUI kit. Read this whole
file before touching anything.

---

## The three packages

| Package | Lives at | Ships |
|---|---|---|
| `@nuvoui/core` | `node_modules/@nuvoui/core` | tokens, utilities, element baseline |
| `@nuvoui/kit` | `app/styles/uikit/` | SCSS component layer, the `.nu-*` classes |
| `@nuvoui/ember` | `app/components/nuvo/` | Glimmer components using those classes |

Invocation is `<Nuvo::Button>`, `<Nuvo::Tag>`, `<Nuvo::Card>`. The file is
`app/components/nuvo/button.js`, the class it renders is `.nu-btn`.

---

## Your job, stated exactly

Read **every single `class` attribute** on your page. For each one, decide:

1. **Does a kit component replace this element?** If yes, use it. This is the
   primary job, not a side effect.
2. **Is this class only a colour override?** Then it stays CSS, rewritten to
   reassign kit variables (see "Variable overrides" below).
3. **Is this genuinely bespoke layout** that no kit component covers? Then it
   stays app-level CSS, but rewritten to consume kit tokens.

Near-duplicates are the thing being removed. If an element differs from a kit
component only in font-size, padding or border-radius, **drop the difference and
use the component**. Do not preserve a 2px delta.

---

## Fix it in the kit, not on the page

If a problem would happen on any page with the same markup, it belongs in
`app/styles/uikit/`, not in your page file. You may not edit the kit, so
**report it** and the orchestrator lands it.

Real examples from this migration, all of which started as page-level patches
and were moved:

- An unlabelled control in a filter row sat 16px below its labelled siblings.
  That is form layout, not a properties problem. Now `.nu-field__label-spacer`
  and `.nu-filter-row` in `form.scss`.
- A selected chip painted its label the same colour as its background. Now
  scoped `:not(.is-selected):hover` in `tag.scss`.
- Three pages each grew their own toggle-chip. Now `.nu-tag.m-selectable`.

Smell test: would this CSS be identical on another page? Then it is kit work.

---

## Known traps, every one of these has already bitten

- **`@align="start"` on `<Nuvo::Dropdown>` is required** in a form or filter
  row. Without it the trigger is an `inline-flex` button that shrinks to its
  content and centres its label.
- **Trigger alignment and option alignment are separate axes.** `@align`
  controls the trigger, `@optionsAlign` the menu. Never couple them.
- **Never name a block param after an HTML element.** `{{#each ... as |option|}}`
  shadows `<option>` and Glimmer crashes trying to invoke it as a component.
- **Never animate `transform` on an element positioned by a transform.** It
  replaces the placement transform and the element jumps.
- **`@align` uses `start`/`center`/`end`, never left/right.** This app ships RTL.
- **A green build proves nothing here.** Every visual bug in this migration was
  invisible to `ember build`.

---

## Hard rules

1. **`app/styles/app.new.scss` is READ-ONLY REFERENCE.** Never edit it, never
   delete from it. It is how a future session learns what a legacy class meant.
   Read it to understand a class, then write fresh.

2. **`app/styles/pages/_tags.scss` is READ-ONLY SHARED.** It holds the whole
   domain tag vocabulary. If your page needs a value that is not there,
   **report it in your final message**. Do not add it. Do not fork it.

3. **Never edit `app/styles/uikit/` or `app/components/nuvo/`.** They are
   published packages. If a component is missing a feature you need, report it.

4. **Your CSS goes in exactly one new file:** `app/styles/pages/_<page>.scss`.
   Nothing anywhere else. Do not touch `app.scss`; the orchestrator wires it up.

5. **Never start a dev server.** One is already running on port 4200 and it is
   not yours. Verify with `npx ember build` or
   `npx sass --load-path=node_modules app/styles/app.scss /dev/null`.

6. **No `!important`. No hardcoded hex/rgb/hsl. No inline styles. No Tailwind.**
   Colours come from tokens. Spacing comes from the scale.

7. **Preserve every `data-test-*` attribute.** Tests depend on them.

8. **Preserve behaviour exactly.** Same actions, same conditionals, same
   modifiers. This is a presentation migration, not a refactor. If you find a
   real bug, report it; do not silently fix it.

---

## Domain tags: the pattern

Legacy markup concatenated a class from a raw enum value:

```hbs
<span class="status-badge status-{{lowercase lead.status}}">{{lead.status}}</span>
```

That flattened six unrelated enums into one namespace, so `MAINTENANCE` was the
same colour as a property status, a cheque type and a document category.

New markup names the domain:

```hbs
<Nuvo::Tag class="tag-lead-{{lowercase lead.status}}">{{lead.status}}</Nuvo::Tag>
```

The domain prefixes live in `_tags.scss`: `lead`, `temp`, `txn`, `commission`,
`unit`, `proptype`, `wo`, `priority`, `trade`, `cheque`, `commtype`, `contact`,
`doc`, `access`, `email`, `lease`, `plan`, `sub`, `account`.

**Pick the domain that matches the field**, not the one that matches the old
class name. `status-{{wo.priority}}` becomes `tag-priority-{{...}}`, because a
priority is not a status.

**Always pipe through `{{lowercase}}`.** Several legacy sites omitted it and
emitted `status-AVAILABLE`, which matched nothing and rendered unstyled. Every
key in `_tags.scss` is lowercase.

---

## `glass-panel` is dead. Remove every one you find.

`.glass-panel` was surface + border + radius + padding + shadow. There is no
glass in it, and it is exactly what `<Nuvo::Card>` already renders. It is noise.

Every `class="glass-panel ..."` on your page becomes `<Nuvo::Card>`. Keep any
utility classes that were riding along with it (`p-6`, `flex`, `col`, `gap-4`)
only where they are still doing something the card does not; the card already
supplies its own padding, so a `p-*` next to it is usually redundant too.

Never write a `.glass-panel` rule into your page file. It does not survive.

---

## Variable overrides: the mechanism

When a legacy class only changed colour, do not write properties. Reassign the
component's variables. The kit's base rule is the only consumer.

Wrong:
```scss
.my-thing { background-color: var(--success-50); }
```

Right:
```scss
.my-thing {
  --nu-tag--BackgroundColor: var(--success-50);
  --nu-tag--Color: var(--success-700);
}
```

This composes with kit modifiers and costs nothing at runtime.

---

## Legacy components to replace

These live in `app/components/ui/` and have kit equivalents. Replace them on
your page in the same pass:

| Legacy | Kit |
|---|---|
| `<Ui::AppButton>` | `<Nuvo::Button>` |
| `<Ui::Modal>` | `<Nuvo::Modal>` |
| `<Ui::Pagination>` | `<Nuvo::Pagination>` |
| `<Ui::Tabs>` | `<Nuvo::Tabs>` |
| `<Ui::FormInput>` | `<Nuvo::Input>` or `<Nuvo::Field>` |
| `<Ui::FormTextarea>` | `<Nuvo::Textarea>` |
| `<Ui::FormDropdown>` | `<Nuvo::Select>` or `<Nuvo::Dropdown>` |

Do not delete the `ui/` component files. Other pages still use them.

---

## Available kit components

Read `app/components/nuvo/CONVENTIONS.md` first, then the specific component's
`.js` and `.hbs` before using it. Do not guess an argument name.

```
Accordion  Alert  Avatar  AvatarGroup  Badge  Breadcrumb  BtnGroup  Button
Card  Checkbox  DescList  Divider  Dot  Drawer  Dropdown  EmptyState  Field
FormActions  InfoRow  Input  InputGroup  List  ListItem  Modal  PageHeader
Pagination  Panel  Popover  Progress  ProgressCircle  Radio  Select  Sidebar
SidebarLink  Skeleton  Spinner  Stat  Tabs  Tag  Text  Textarea  Title
Toggle  Toolbar  Tooltip  Topbar
```

The `.nu-*` SCSS classes are in `app/styles/uikit/`. A component's SCSS file
tells you every modifier and state it supports.

Tables use `.nu-table` classes directly, there is no Table component. Kanban,
timeline, toast and code-block have SCSS but no Glimmer component yet.

Core utility classes (`flex`, `gap-2`, `col`, `text-muted`, `font-sm`, `p-4`)
come from `@nuvoui/core` and are fine to keep using.

---

## Verification before you report

1. `npx sass --load-path=node_modules app/styles/app.scss /dev/null` compiles.
   (Add your `@use` line to a scratch file to test; the orchestrator wires the
   real one.)
2. `npx ember build --environment=development` succeeds.
3. Grep your own output: no hex, no `!important`, no inline `style=`.
4. Every `data-test-*` that was on the page before is still on it.

A green build proves the code parses. It does not prove the page looks right.
The orchestrator does browser verification at the end. Be conservative.

---

## Your final report

Keep it under 20 lines:

- Components adopted, and how many elements each replaced
- Classes kept as variable overrides, and why
- Classes kept as bespoke layout, and why no component fit
- Anything you needed from `_tags.scss` that was missing
- Anything you needed from the kit that does not exist
- Any real bug you found and did NOT fix

import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_NOTES = {
  default: 'No @variant: the kit base button (wu-btn). The default for everything that is not the main action: cancel, back, filters, secondary tools.',
  brand: 'Kit wu-btn brand. The one main action of a view: save, submit, create. Keep a single brand button per region so the eye has one target.',
  danger: 'Kit wu-btn danger. Destructive or irreversible: delete, revoke, cancel a lease. Pair it with a confirm dialog for anything that cannot be undone.',
  ghost: 'Kit wu-btn quiet. No fill or border until hover. For toolbars, table rows and icon buttons where a solid button would be noise.',
  link: 'Kit wu-btn link. Looks like inline text and keeps the control height. For low-emphasis actions inside sentences, footers and empty states.',
};

const SIZE_NOTES = {
  sm: 'Kit sm. Compact controls beside inputs, in card footers and table rows. @size="xs" also renders sm.',
  md: 'The default. Forms, dialogs and page actions.',
  lg: 'Kit lg. Hero and empty-state actions where the button is the point of the screen. @size="xl" also renders lg.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenButtonController extends Controller {
  @tracked loadingDemo = false;

  @action
  toggleLoading() {
    this.loadingDemo = !this.loadingDemo;
  }

  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Woven::Button @text="Default" />'
        : `<Woven::Button @variant="${variant}" @text="${capitalize(variant)}" />`,
  }));

  sizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size: size === 'md' ? undefined : size,
    title: size === 'md' ? 'Default (md)' : capitalize(size),
    note: SIZE_NOTES[size],
    code:
      size === 'md'
        ? '<Woven::Button @variant="brand" @text="Default" />'
        : `<Woven::Button @variant="brand" @size="${size}" @text="${size.toUpperCase()}" />`,
  }));

  code = {
    subtle: `<Woven::Button @variant="brand" @subtle={{true}} @text="Approve" />
<Woven::Button @variant="danger" @subtle={{true}} @icon="trash" @text="Delete" />`,
    secondary: `<Woven::Button @variant="secondary" @text="Secondary" />`,
    square: `<Woven::Button @variant="brand" @shape="square" @icon="plus" aria-label="Add" />`,
    circle: `<Woven::Button @shape="circle" @icon="x" aria-label="Close" />`,
    iconStart: `<Woven::Button @variant="brand" @icon="plus" @text="Add unit" />`,
    iconEnd: `<Woven::Button @icon="arrow-right" @iconPosition="end" @text="Next" />`,
    glyph: `<Woven::Button @icon="+" @text="Literal glyph" />`,
    iconSlot: `<Woven::Button @variant="brand">
  <:icon><MyOwnIcon /></:icon>
  <:default>Custom icon</:default>
</Woven::Button>`,
    iconSlotLoading: `<Woven::Button @variant="brand" @loading={{true}}>
  <:icon><MyOwnIcon /></:icon>
  <:default>Saving</:default>
</Woven::Button>`,
    disabled: `<Woven::Button @variant="brand" @disabled={{true}} @text="Disabled" />`,
    loading: `<Woven::Button
  @variant="brand"
  @loading={{this.loadingDemo}}
  @text={{if this.loadingDemo "Saving" "Click to load"}}
  @onClick={{this.toggleLoading}}
/>`,
    active: `<Woven::Button @active={{true}} @text="Active" />
<Woven::Button @active={{false}} @text="Inactive" />`,
    block: `<Woven::Button @block={{true}} @text="Full width" />`,
    submit: `<form {{on "submit" this.save}}>
  <Woven::Button @type="submit" @variant="brand" @text="Save" />
</form>`,
    route: `<Woven::Button @route="woven.index" @variant="link" @text="Overview" />
<Woven::Button @route="contacts.detail" @model={{contact.id}} @query={{hash tab="leases"}} @text="Open contact" />`,
    href: `<Woven::Button @href="#variants" @text="Jump to variants" />`,
    groupSpaced: `<Woven::BtnGroup>
  <Woven::Button @text="Left" />
  <Woven::Button @text="Middle" />
  <Woven::Button @text="Right" />
</Woven::BtnGroup>`,
    groupAttached: `<Woven::BtnGroup @attached={{true}}>
  <Woven::Button @text="Day" />
  <Woven::Button @active={{true}} @text="Week" />
  <Woven::Button @text="Month" />
</Woven::BtnGroup>`,
    groupIcons: `<Woven::BtnGroup @attached={{true}}>
  <Woven::Button @shape="square" @icon="caret-left" aria-label="Previous" />
  <Woven::Button @shape="square" @icon="caret-right" aria-label="Next" />
</Woven::BtnGroup>`,
  };

  argRows = [
    { name: '@variant', type: '"brand" | "danger" | "ghost" | "link" | "secondary"', default: '', description: 'Kit modifier: brand to brand, danger to danger, ghost to quiet, link to link, secondary to subtle (no rule on its own, renders the default look). success, warning, info and unknown values render the default button.' },
    { name: '@subtle', type: 'boolean', default: 'false', description: 'Adds the kit subtle modifier: with brand or danger a tinted fill and border, solid on hover. No effect on its own.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg; xs renders sm and xl renders lg. Omit for the default size.' },
    { name: '@shape', type: '"square" | "circle"', default: '', description: 'Icon-only: square is kit icon, circle is kit icon round. The label is dropped, so pass aria-label.' },
    { name: '@block', type: 'boolean', default: 'false', description: 'Full width through the core w-full utility.' },
    { name: '@active', type: 'boolean', default: '', description: 'Sets aria-pressed for toggles; button mode only. Not passed means no aria-pressed.' },
    { name: '@loading', type: 'boolean', default: 'false', description: 'Shows a kit wu-spinner sm in the icon slot, sets aria-busy and disables the button.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Sets disabled on a button, aria-disabled on a link, and blocks onClick.' },
    { name: '@icon', type: 'string', default: '', description: 'Lowercase kebab-case reads as a Phosphor icon name; anything else renders as a literal glyph.' },
    { name: '@iconPosition', type: '"start" | "end"', default: '"start"', description: 'Side of the label the icon renders on. Ignored while loading.' },
    { name: '@text', type: 'string', default: '', description: 'Label when no block is given.' },
    { name: '@type', type: 'string', default: '"button"', description: 'Native button type; pass "submit" inside a form.' },
    { name: '@route', type: 'string', default: '', description: 'Renders a LinkTo to this route instead of a button.' },
    { name: '@model', type: 'any', default: '', description: 'Single dynamic segment for @route.' },
    { name: '@models', type: 'array', default: '', description: 'Dynamic segments for @route; takes precedence over @model.' },
    { name: '@query', type: 'object', default: '{}', description: 'Query params for @route.' },
    { name: '@href', type: 'string', default: '', description: 'Renders an anchor instead of a button.' },
  ];

  callbackRows = [
    { name: '@onClick', signature: '(event)', description: 'Called on click unless disabled or loading. Button mode only; route and href modes navigate.' },
  ];

  blockRows = [
    { name: 'default', description: 'Label content. Takes precedence over @text.' },
    { name: 'icon', description: 'Replaces the built-in icon. A loading spinner still takes its place while @loading is set.' },
  ];

  groupArgRows = [
    { name: '@attached', type: 'boolean', default: 'false', description: 'Kit wu-btn-group: joins the buttons into one bar with shared borders. Omit for a spaced row (core flex inline x-center gap-2).' },
  ];
}

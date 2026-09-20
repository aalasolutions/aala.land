import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_NOTES = {
  primary: 'The one main action of a view: save, submit, create. Keep a single primary per region so the eye has one target.',
  secondary: 'The default for everything that is not the main action: cancel, back, filters, secondary tools. Neutral, always safe.',
  success: 'Confirms a positive outcome, such as approve, mark paid or activate. Use it where green carries meaning, not for every save.',
  warning: 'An action with consequences the user should weigh, such as suspend or override. Amber says pause before you click.',
  danger: 'Destructive or irreversible: delete, revoke, cancel a lease. Pair it with a confirm dialog for anything that cannot be undone.',
  info: 'Informational or exploratory actions: view details, learn more. Calmer than primary, still a filled button.',
  ghost: 'No fill or border until hover. For toolbars, table rows and icon buttons where a solid button would be noise.',
  link: 'Looks like inline text. For low-emphasis actions inside sentences, footers and empty states.',
};

const SIZE_NOTES = {
  xs: 'Dense rows and chips: table actions, tag toolbars, filter bars. The smallest target the kit allows.',
  sm: 'Compact controls beside inputs and in card footers.',
  md: 'The default. Forms, dialogs and page actions.',
  lg: 'Hero and empty-state actions where the button is the point of the screen.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoButtonController extends Controller {
  @tracked loadingDemo = false;

  @action
  toggleLoading() {
    this.loadingDemo = !this.loadingDemo;
  }

  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code: `<Nuvo::Button @variant="${variant}" @text="${capitalize(variant)}" />`,
  }));

  sizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size: size === 'md' ? undefined : size,
    title: size === 'md' ? 'Default (md)' : capitalize(size),
    note: SIZE_NOTES[size],
    code:
      size === 'md'
        ? '<Nuvo::Button @variant="primary" @text="Default" />'
        : `<Nuvo::Button @variant="primary" @size="${size}" @text="${size.toUpperCase()}" />`,
  }));

  code = {
    outline: `<Nuvo::Button @variant="primary" @outline={{true}} @text="Outline" />
<Nuvo::Button @variant="danger" @outline={{true}} @text="Outline" />
<Nuvo::Button @variant="success" @outline={{true}} @text="Outline" />`,
    square: `<Nuvo::Button @variant="primary" @shape="square" @icon="plus" aria-label="Add" />`,
    circle: `<Nuvo::Button @variant="secondary" @shape="circle" @icon="x" aria-label="Close" />`,
    iconStart: `<Nuvo::Button @variant="primary" @icon="plus" @text="Add unit" />`,
    iconEnd: `<Nuvo::Button @variant="secondary" @icon="arrow-right" @iconPosition="end" @text="Next" />`,
    glyph: `<Nuvo::Button @variant="secondary" @icon="+" @text="Literal glyph" />`,
    loadingIcon: `<Nuvo::Button @variant="secondary" @loading={{true}} @loadingIcon="circle-notch" @text="Custom spinner" />`,
    iconSlot: `<Nuvo::Button @variant="primary">
  <:icon><MyOwnIcon /></:icon>
  <:default>Custom icon</:default>
</Nuvo::Button>`,
    iconSlotLoading: `<Nuvo::Button @variant="primary" @loading={{true}}>
  <:icon><MyOwnIcon /></:icon>
  <:default>Saving</:default>
</Nuvo::Button>`,
    disabled: `<Nuvo::Button @variant="primary" @disabled={{true}} @text="Disabled" />`,
    loading: `<Nuvo::Button
  @variant="primary"
  @loading={{this.loadingDemo}}
  @text={{if this.loadingDemo "Saving" "Click to load"}}
  @onClick={{this.toggleLoading}}
/>`,
    active: `<Nuvo::Button @variant="secondary" @active={{true}} @text="Active" />
<Nuvo::Button @variant="secondary" @text="Inactive" />`,
    block: `<Nuvo::Button @variant="secondary" @block={{true}} @text="Full width" />`,
    submit: `<form {{on "submit" this.save}}>
  <Nuvo::Button @type="submit" @variant="primary" @text="Save" />
</form>`,
    route: `<Nuvo::Button @route="nuvo.index" @variant="link" @text="Overview" />
<Nuvo::Button @route="contacts.detail" @model={{contact.id}} @query={{hash tab="leases"}} @text="Open contact" />`,
    href: `<Nuvo::Button @href="#examples" @variant="secondary" @text="Anchor to this section" />`,
    groupSpaced: `<Nuvo::BtnGroup>
  <Nuvo::Button @variant="secondary" @text="Left" />
  <Nuvo::Button @variant="secondary" @text="Middle" />
  <Nuvo::Button @variant="secondary" @text="Right" />
</Nuvo::BtnGroup>`,
    groupAttached: `<Nuvo::BtnGroup @attached={{true}}>
  <Nuvo::Button @variant="secondary" @text="Day" />
  <Nuvo::Button @variant="secondary" @active={{true}} @text="Week" />
  <Nuvo::Button @variant="secondary" @text="Month" />
</Nuvo::BtnGroup>`,
    groupIcons: `<Nuvo::BtnGroup @attached={{true}}>
  <Nuvo::Button @variant="secondary" @shape="square" @icon="caret-left" aria-label="Previous" />
  <Nuvo::Button @variant="secondary" @shape="square" @icon="caret-right" aria-label="Next" />
</Nuvo::BtnGroup>`,
  };

  argRows = [
    { name: '@variant', type: '"primary" | "secondary" | "success" | "warning" | "danger" | "info" | "ghost" | "link"', default: '', description: 'Colour and border strategy. Unknown values render the unmodified base button.' },
    { name: '@size', type: '"xs" | "sm" | "lg"', default: '', description: 'Height and padding step. Omit for the default size.' },
    { name: '@shape', type: '"square" | "circle"', default: '', description: 'Icon-only shape. The label is dropped, so pass aria-label.' },
    { name: '@outline', type: 'boolean', default: 'false', description: 'Transparent fill with a variant-coloured border.' },
    { name: '@block', type: 'boolean', default: 'false', description: 'Full-width display (is-block). The docs demo passes the class instead because the project template-lint reserves the argument name.' },
    { name: '@active', type: 'boolean', default: 'false', description: 'Pressed appearance for toggles and selected group members.' },
    { name: '@loading', type: 'boolean', default: 'false', description: 'Swaps the icon for a spinning loading icon and disables the button.' },
    { name: '@loadingIcon', type: 'string', default: '"spinner-gap"', description: 'Phosphor icon shown while loading.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Sets the disabled attribute and blocks onClick.' },
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
  ];

  groupArgRows = [
    { name: '@attached', type: 'boolean', default: 'false', description: 'Joins the buttons into one segmented bar with shared borders. Omit for a spaced row.' },
  ];
}

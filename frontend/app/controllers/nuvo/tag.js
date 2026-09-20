import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_NOTES = {
  default: 'Neutral grey for categories that carry no judgement.',
  primary: 'Brand colour for the category the user is filtering by or has just added.',
  secondary: 'A second neutral tone to tell two kinds of tag apart on one row.',
  success: 'Positive attributes: verified, paid, furnished.',
  warning: 'Attributes that need a look: expiring, unverified.',
  danger: 'Attributes that block or fail: blacklisted, overdue.',
  info: 'Descriptive metadata such as source or channel.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoTagController extends Controller {
  chipOptions = ['Parking', 'Pool', 'Gym', 'Balcony', 'Furnished'];
  @tracked selectedChips = ['Pool'];
  @tracked lastClosed = 'none yet';

  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Nuvo::Tag @text="Default" />'
        : `<Nuvo::Tag @variant="${variant}" @text="${capitalize(variant)}" />`,
  }));

  @action
  toggleChip(chip) {
    this.selectedChips = this.selectedChips.includes(chip)
      ? this.selectedChips.filter((c) => c !== chip)
      : [...this.selectedChips, chip];
  }

  @action
  noteClose(label) {
    this.lastClosed = label;
  }

  code = {
    outline: `<Nuvo::Tag @variant="primary" @outline={{true}} @text="Outline" />`,
    sm: `<Nuvo::Tag @variant="success" @size="sm" @text="Small" />`,
    lg: `<Nuvo::Tag @variant="success" @size="lg" @text="Large" />`,
    closable: `<Nuvo::Tag @variant="info" @closable={{true}} @text="Closable" @onClose={{fn this.noteClose "Closable"}} />`,
    disabled: `<Nuvo::Tag @variant="danger" @disabled={{true}} @closable={{true}} @text="Disabled" />`,
    block: `<Nuvo::Tag @variant="primary">
  <Nuvo::Icon @icon="car" /> Parking
</Nuvo::Tag>`,
    chips: `{{#each this.chipOptions as |chip|}}
  <button
    type="button"
    class="nu-tag m-pill m-selectable {{if (includes this.selectedChips chip) 'is-selected'}}"
    aria-pressed={{if (includes this.selectedChips chip) "true" "false"}}
    {{on "click" (fn this.toggleChip chip)}}
  >{{chip}}</button>
{{/each}}`,
  };

  argRows = [
    { name: '@variant', type: '"primary" | "secondary" | "success" | "warning" | "danger" | "info"', default: '', description: 'Colour scale. Unknown values render the neutral tag.' },
    { name: '@size', type: '"sm" | "lg"', default: '', description: 'Size step.' },
    { name: '@outline', type: 'boolean', default: 'false', description: 'Transparent background with a coloured border.' },
    { name: '@closable', type: 'boolean', default: 'false', description: 'Renders a remove button after the label.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Adds is-disabled, disables the remove button and blocks onClose.' },
    { name: '@text', type: 'string', default: '', description: 'Label when no block is given.' },
  ];

  callbackRows = [
    { name: '@onClose', signature: '(event)', description: 'Called when the remove button is clicked and the tag is not disabled. The caller removes the tag; the component does not hide itself.' },
  ];

  blockRows = [
    { name: 'default', description: 'Label content. Takes precedence over @text.' },
  ];

  classRows = [
    { name: 'nu-tag.m-pill', description: 'Fully rounded ends.' },
    { name: 'nu-tag.m-selectable', description: 'Hover and pressed affordance for a tag used as a toggle. Apply to a real button.' },
    { name: 'nu-tag.is-selected', description: 'Selected state of a selectable tag.' },
  ];
}

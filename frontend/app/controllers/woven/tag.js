import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_NOTES = {
  default: 'Neutral tag for categories that carry no judgment.',
  brand: 'Brand role color for the category the user is filtering by or has just added.',
  secondary: 'Gray hue, a second neutral tone to tell two kinds of tag apart on one row.',
  success: 'Success role color for positive states: verified, paid, furnished.',
  warning: 'Warning role color for states that need a look: expiring, unverified.',
  danger: 'Danger role color for states that block or fail: blacklisted, overdue.',
  info: 'Info role color for descriptive metadata such as source or channel.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenTagController extends Controller {
  chipOptions = ['Parking', 'Pool', 'Gym', 'Balcony', 'Furnished'];
  @tracked selectedChips = ['Pool'];
  @tracked lastClosed = 'none yet';

  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Woven::Tag @text="Default" />'
        : `<Woven::Tag @variant="${variant}" @text="${capitalize(variant)}" />`,
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
    closable: `<Woven::Tag @variant="info" @closable={{true}} @text="Closable" @onClose={{fn this.noteClose "Closable"}} />`,
    disabled: `<Woven::Tag @variant="danger" @disabled={{true}} @closable={{true}} @text="Disabled" />`,
    block: `<Woven::Tag @variant="brand">
  <Woven::Icon @icon="car" /> Parking
</Woven::Tag>`,
    chips: `{{#each this.chipOptions as |chip|}}
  <button
    type="button"
    class="wu-tag"
    aria-pressed={{if (includes this.selectedChips chip) "true" "false"}}
    {{on "click" (fn this.toggleChip chip)}}
  >{{chip}}</button>
{{/each}}`,
  };

  argRows = [
    { name: '@variant', type: '"brand" | "secondary" | "success" | "warning" | "danger" | "info"', default: '', description: 'Role colors map to the kit role modifiers of the same name; secondary renders the kit gray hue. Unknown values render the neutral tag. Other kit hues (blue, purple) have no argument; pass them as a class.' },
    { name: '@closable', type: 'boolean', default: 'false', description: 'Renders the kit wu-tag-remove button after the label.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Disables the remove button and blocks onClose. The tag itself keeps its look.' },
    { name: '@text', type: 'string', default: '', description: 'Label when no block is given.' },
  ];

  callbackRows = [
    { name: '@onClose', signature: '(event)', description: 'Called when the remove button is clicked and the tag is not disabled. The caller removes the tag; the component does not hide itself.' },
  ];

  blockRows = [
    { name: 'default', description: 'Label content. Takes precedence over @text.' },
  ];

  classRows = [
    { name: 'button.wu-tag[aria-pressed]', description: 'A tag on a real button is a checkable chip; aria-pressed="true" shows the selected state.' },
  ];
}

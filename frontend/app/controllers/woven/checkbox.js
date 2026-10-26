import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const TOGGLE_VARIANT_NOTES = {
  primary: 'The default brand track for ordinary settings.',
  secondary: 'A neutral track for secondary or grouped settings.',
  success: 'A switch that enables something good, such as a feature going live.',
  warning: 'A switch with consequences, such as sending notifications to tenants.',
  danger: 'A switch that disables protection or exposes data.',
  info: 'A purely informational preference.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenCheckboxController extends Controller {
  @tracked checkboxValue = true;
  @tracked radioValue = 'apartment';
  @tracked toggleValue = true;
  @tracked toggleWithTextValue = false;
  @tracked variantToggles = {
    primary: true,
    secondary: true,
    success: true,
    warning: true,
    danger: true,
    info: true,
  };

  toggleVariantExamples = Object.keys(TOGGLE_VARIANT_NOTES).map((variant) => ({
    variant,
    title: capitalize(variant),
    note: TOGGLE_VARIANT_NOTES[variant],
    code: `<Woven::Toggle @variant="${variant}" @checked={{this.on}} @onChange={{this.setOn}} />`,
  }));

  @action
  updateCheckbox(value) {
    this.checkboxValue = value;
  }

  @action
  updateRadio(value) {
    this.radioValue = value;
  }

  @action
  updateToggle(value) {
    this.toggleValue = value;
  }

  @action
  updateToggleWithText(value) {
    this.toggleWithTextValue = value;
  }

  @action
  updateVariantToggle(variant, value) {
    this.variantToggles = { ...this.variantToggles, [variant]: value };
  }

  code = {
    checkbox: `<Woven::Checkbox @checked={{this.checkboxValue}} @label="Include archived units" @onChange={{this.updateCheckbox}} />`,
    indeterminate: `<Woven::Checkbox @indeterminate={{true}} @label="Some selected" />`,
    disabledChecked: `<Woven::Checkbox @checked={{true}} @disabled={{true}} @label="Disabled checked" />`,
    disabledUnchecked: `<Woven::Checkbox @disabled={{true}} @label="Disabled unchecked" />`,
    unlabelled: `<Woven::Checkbox @checked={{true}} aria-label="Select row" />`,
    checkboxSizes: `<Woven::Checkbox @size="xs" @checked={{true}} @label="Extra small" />
<Woven::Checkbox @size="sm" @checked={{true}} @label="Small" />
<Woven::Checkbox @checked={{true}} @label="Default" />
<Woven::Checkbox @size="lg" @checked={{true}} @label="Large" />`,
    group: `<div class="wu-check-group">
  <Woven::Checkbox @label="Parking" />
  <Woven::Checkbox @label="Pool" />
  <Woven::Checkbox @label="Gym" />
</div>`,
    radio: `<div class="wu-check-group">
  <Woven::Radio @name="property-type" @value="apartment" @checked={{eq this.radioValue "apartment"}} @label="Apartment" @onChange={{this.updateRadio}} />
  <Woven::Radio @name="property-type" @value="villa" @checked={{eq this.radioValue "villa"}} @label="Villa" @onChange={{this.updateRadio}} />
  <Woven::Radio @name="property-type" @value="townhouse" @checked={{eq this.radioValue "townhouse"}} @label="Townhouse" @onChange={{this.updateRadio}} />
</div>`,
    radioSizes: `<Woven::Radio @name="radio-size-xs" @size="xs" @checked={{true}} @label="Extra small" />
<Woven::Radio @name="radio-size-sm" @size="sm" @checked={{true}} @label="Small" />
<Woven::Radio @name="radio-size-md" @checked={{true}} @label="Default" />
<Woven::Radio @name="radio-size-lg" @size="lg" @checked={{true}} @label="Large" />`,
    radioDisabled: `<Woven::Radio @name="property-type-disabled" @disabled={{true}} @label="Disabled" />`,
    radioBlock: `<Woven::Radio @name="plan" @value="growth" @checked={{true}}>
  <strong>Growth</strong> <span class="wu-text m-xs m-muted">multi-region</span>
</Woven::Radio>`,
    toggle: `<Woven::Toggle @checked={{this.toggleValue}} @onChange={{this.updateToggle}} />`,
    toggleSizes: `<Woven::Toggle @size="xs" @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>Extra small</Woven::Toggle>
<Woven::Toggle @size="sm" @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>Small</Woven::Toggle>
<Woven::Toggle @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>Default</Woven::Toggle>
<Woven::Toggle @size="lg" @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>Large</Woven::Toggle>`,
    toggleDisabled: `<Woven::Toggle @disabled={{true}} @checked={{true}} />`,
    toggleText: `<Woven::Toggle @checked={{this.toggleWithTextValue}} @activeText="ON" @inactiveText="OFF" @onChange={{this.updateToggleWithText}} />`,
    toggleLabel: `<Woven::Toggle @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>
  Auto-assign leads
</Woven::Toggle>`,
  };

  checkboxArgRows = [
    { name: '@checked', type: 'boolean', default: '', description: 'Checked state. Controlled; update it from @onChange.' },
    { name: '@label', type: 'string', default: '', description: 'Visible label rendered inside the label element.' },
    { name: '@value', type: 'string', default: '', description: 'Native value attribute.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute; the label gets is-disabled.' },
    { name: '@indeterminate', type: 'boolean', default: 'false', description: 'Sets the DOM indeterminate property on insert and on change.' },
    { name: '@size', type: '"xs" | "sm" | "lg"', default: '', description: 'Box and label size step. Omit for the default size.' },
  ];

  checkboxCallbackRows = [
    { name: '@onChange', signature: '(checked, event)', description: 'Native change event with the new checked boolean first.' },
  ];

  radioArgRows = [
    { name: '@name', type: 'string', default: '', description: 'Group name shared by every radio in the set.' },
    { name: '@value', type: 'string', default: '', description: 'Value reported to @onChange when this radio is chosen.' },
    { name: '@checked', type: 'boolean', default: '', description: 'Checked state. Derive it from the group value.' },
    { name: '@label', type: 'string', default: '', description: 'Visible label when no block is given.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute; the label gets is-disabled.' },
    { name: '@size', type: '"xs" | "sm" | "lg"', default: '', description: 'Circle and label size step. Omit for the default size.' },
  ];

  radioCallbackRows = [
    { name: '@onChange', signature: '(value, event)', description: 'Fires only when this radio becomes checked, with its @value.' },
  ];

  toggleArgRows = [
    { name: '@checked', type: 'boolean', default: '', description: 'On/off state. Controlled; update it from @onChange.' },
    { name: '@variant', type: '"primary" | "secondary" | "success" | "warning" | "danger" | "info"', default: '', description: 'Track colour while on.' },
    { name: '@size', type: '"xs" | "sm" | "lg"', default: '', description: 'Track size step. Omit for the default size.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute plus is-disabled.' },
    { name: '@activeText', type: 'string', default: '', description: 'Short text shown inside the track while on. Adds m-with-text.' },
    { name: '@inactiveText', type: 'string', default: '', description: 'Short text shown inside the track while off. Adds m-with-text.' },
  ];

  toggleCallbackRows = [
    { name: '@onChange', signature: '(checked, event)', description: 'Native change event with the new checked boolean first.' },
  ];

  toggleBlockRows = [
    { name: 'default', description: 'Label text rendered beside the track, inside the label element.' },
  ];

  classRows = [
    { name: 'wu-check-group', description: 'Lays out a run of checkboxes or radios with consistent row and column gaps.' },
  ];
}

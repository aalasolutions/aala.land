import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WovenCheckboxController extends Controller {
  @tracked checkboxValue = true;
  @tracked radioValue = 'apartment';
  @tracked toggleValue = true;

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

  code = {
    checkbox: `<Woven::Checkbox @checked={{this.checkboxValue}} @label="Include archived units" @onChange={{this.updateCheckbox}} />`,
    indeterminate: `<Woven::Checkbox @indeterminate={{true}} @label="Some selected" />`,
    disabledChecked: `<Woven::Checkbox @checked={{true}} @disabled={{true}} @label="Disabled checked" />`,
    disabledUnchecked: `<Woven::Checkbox @disabled={{true}} @label="Disabled unchecked" />`,
    unlabeled: `<Woven::Checkbox @checked={{true}} aria-label="Select row" />`,
    checkboxSizes: `<Woven::Checkbox @size="sm" @checked={{true}} @label="Small" />
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
    radioSizes: `<Woven::Radio @name="radio-size-sm" @size="sm" @checked={{true}} @label="Small" />
<Woven::Radio @name="radio-size-md" @checked={{true}} @label="Default" />
<Woven::Radio @name="radio-size-lg" @size="lg" @checked={{true}} @label="Large" />`,
    radioDisabled: `<Woven::Radio @name="property-type-disabled" @disabled={{true}} @label="Disabled" />`,
    radioBlock: `<Woven::Radio @name="plan" @value="growth" @checked={{true}}>
  <strong>Growth</strong> <span class="wu-text sm muted">multi-region</span>
</Woven::Radio>`,
    toggle: `<Woven::Toggle @checked={{this.toggleValue}} @onChange={{this.updateToggle}} />`,
    toggleSizes: `<Woven::Toggle @size="sm" @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>Small</Woven::Toggle>
<Woven::Toggle @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>Default</Woven::Toggle>
<Woven::Toggle @size="lg" @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>Large</Woven::Toggle>`,
    toggleDisabled: `<Woven::Toggle @disabled={{true}} @checked={{true}} />`,
    toggleLabel: `<Woven::Toggle @checked={{this.toggleValue}} @onChange={{this.updateToggle}}>
  Auto-assign leads
</Woven::Toggle>`,
  };

  checkboxArgRows = [
    { name: '@checked', type: 'boolean', default: '', description: 'Checked state. Controlled; update it from @onChange.' },
    { name: '@label', type: 'string', default: '', description: 'Visible label rendered inside the label element.' },
    { name: '@value', type: 'string', default: '', description: 'Native value attribute.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute; the kit dims the control and label.' },
    { name: '@indeterminate', type: 'boolean', default: 'false', description: 'Sets the DOM indeterminate property on insert and on change; the kit draws a dash.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg; xs renders sm and xl renders lg. Omit for the default size.' },
    { name: '@required', type: 'boolean', default: 'false', description: 'Sets aria-required="true" on the input.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'data-wu-status on the input; error also sets aria-invalid. @invalid and @valid alias it.' },
    { name: '@describedBy', type: 'string', default: '', description: 'aria-describedby on the input, for a message outside a Field.' },
  ];

  checkboxCallbackRows = [
    { name: '@onChange', signature: '(checked, event)', description: 'Native change event with the new checked boolean first.' },
  ];

  radioArgRows = [
    { name: '@name', type: 'string', default: '', description: 'Group name shared by every radio in the set.' },
    { name: '@value', type: 'string', default: '', description: 'Value reported to @onChange when this radio is chosen.' },
    { name: '@checked', type: 'boolean', default: '', description: 'Checked state. Derive it from the group value.' },
    { name: '@label', type: 'string', default: '', description: 'Visible label when no block is given.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute; the kit dims the control and label.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg; xs renders sm and xl renders lg.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'data-wu-status on this input only; the invalid state of a set belongs to Woven::FieldGroup.' },
    { name: '@describedBy', type: 'string', default: '', description: 'aria-describedby on the input.' },
  ];

  radioCallbackRows = [
    { name: '@onChange', signature: '(value, event)', description: 'Fires only when this radio becomes checked, with its @value.' },
  ];

  toggleArgRows = [
    { name: '@checked', type: 'boolean', default: '', description: 'On/off state. Controlled; update it from @onChange.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg switch and label; xs renders sm and xl renders lg.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute; the kit dims the switch.' },
    { name: '@required', type: 'boolean', default: 'false', description: 'Sets aria-required="true" on the input.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'data-wu-status on the input; error also sets aria-invalid. @invalid and @valid alias it.' },
    { name: '@describedBy', type: 'string', default: '', description: 'aria-describedby on the input.' },
  ];

  toggleCallbackRows = [
    { name: '@onChange', signature: '(checked, event)', description: 'Native change event with the new checked boolean first.' },
  ];

  toggleBlockRows = [
    { name: 'default', description: 'Label text in the kit wu-toggle-label beside the switch, inside the label element.' },
  ];

  classRows = [
    { name: 'wu-check-group', description: 'Lays out a run of checkboxes or radios with consistent row and column gaps.' },
  ];
}

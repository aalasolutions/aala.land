import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WovenFieldController extends Controller {
  @tracked filterStatus = '';
  @tracked filterSearch = '';
  @tracked notify = true;
  @tracked chequeNumber = '';
  @tracked chequeError = null;
  @tracked paymentMethod = null;

  buildings = [
    { id: '1', name: 'Marina Tower' },
    { id: '2', name: 'Bay Square' },
  ];

  @action
  setChequeNumber(value) {
    this.chequeNumber = value;
    this.chequeError =
      value && !/^[0-9]{6}$/.test(value)
        ? 'Enter the six digits printed on the cheque'
        : null;
  }

  @action
  setPaymentMethod(value) {
    this.paymentMethod = value;
  }

  regionOptions = [
    { value: 'dubai-marina', label: 'Dubai Marina' },
    { value: 'downtown', label: 'Downtown Dubai' },
    { value: 'jvc', label: 'JVC' },
  ];

  filterStatusOptions = [
    { value: '', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
  ];

  @action
  setFilterStatus(value) {
    this.filterStatus = value;
  }

  @action
  setFilterSearch(value) {
    this.filterSearch = value;
  }

  @action
  clearFilters() {
    this.filterStatus = '';
    this.filterSearch = '';
  }

  @action
  setNotify(value) {
    this.notify = value;
  }

  code = {
    label: `<Woven::Field @label="Property name">
  <Woven::Input @placeholder="Marina Tower" />
</Woven::Field>`,
    required: `<Woven::Field @label="Property name" @required={{true}}>
  <Woven::Input @placeholder="Marina Tower" required />
</Woven::Field>`,
    hint: `<Woven::Field @label="Property name" @hint="Shown to tenants on the portal">
  <Woven::Input @placeholder="Marina Tower" />
</Woven::Field>`,
    error: `<Woven::Field @label="Monthly rent" @hint="Whole dirhams" @error="Rent must be greater than 0">
  <Woven::Input @value="-100" />
</Woven::Field>`,
    statuses: `<Woven::Field @label="Monthly rent" @error="Enter a rent greater than 0">
  <Woven::Input @value="-100" />
</Woven::Field>
<Woven::Field @label="Monthly rent" @status="warning" @hint="Above the area average; check the amount">
  <Woven::Input @value="400000" />
</Woven::Field>
<Woven::Field @label="Monthly rent" @status="success" @hint="Matches the signed lease">
  <Woven::Input @value="85000" />
</Woven::Field>`,
    statusControls: `<Woven::Field @label="Region" @error="Choose a region">
  <Woven::Select @options={{this.regionOptions}} @placeholder="Choose a region" />
</Woven::Field>
<Woven::Field @label="Terms" @error="Accept the terms to continue">
  <Woven::Checkbox @label="I accept the terms" />
</Woven::Field>`,
    liveError: `<Woven::Field @label="Cheque number" @hint="Six digits" @error={{this.chequeError}} @required={{true}}>
  <Woven::Input @value={{this.chequeNumber}} @inputmode="numeric" @onInput={{this.setChequeNumber}} pattern="[0-9]*" />
</Woven::Field>`,
    floating: `<Woven::Field @placeholder="Property name" @hint="Shown to tenants on the portal">
  <Woven::Input />
</Woven::Field>
<Woven::Field @placeholder="Region" as |f|>
  <Woven::Select @options={{this.regionOptions}} @placeholder={{f.placeholder}} />
</Woven::Field>`,
    fieldGroup: `<Woven::FieldGroup @label="Payment method" @required={{true}} @error="Choose how the tenant pays">
  <div class="wu-check-group">
    <Woven::Radio @name="pay" @value="cheque" @label="Cheque" />
    <Woven::Radio @name="pay" @value="transfer" @label="Bank transfer" />
  </div>
</Woven::FieldGroup>`,
    horizontal: `<Woven::Field @label="Region" @horizontal={{true}}>
  <Woven::Select @options={{this.regionOptions}} @placeholder="Choose a region" />
</Woven::Field>`,
    flush: `<Woven::Field @label="Region" @horizontal={{true}} @flush={{true}}>
  <Woven::Select @options={{this.regionOptions}} @placeholder="Choose a region" />
</Woven::Field>`,
    tooltip: `<Woven::Field
  @label="Tenancy Registration Ref"
  @tooltip="e.g. Ejari in Dubai, Tawtheeq in Abu Dhabi, or your local government lease registry number."
>
  <Woven::Input @placeholder="TR-2026-00001" />
</Woven::Field>`,
    tooltipPosition: `<Woven::Field @label="Deposit" @tooltip="Held until the lease ends." @tooltipPosition="end">
  <Woven::Input @placeholder="5%" />
</Woven::Field>`,
    combobox: `<Woven::Field @label="Status">
  <Woven::Dropdown @align="start" @options={{this.filterStatusOptions}} @placeholder="All" />
</Woven::Field>`,
    toggle: `<Woven::Field @label="Notify tenants" @horizontal={{true}}>
  <Woven::Toggle @checked={{this.notify}} @onChange={{this.setNotify}} />
</Woven::Field>`,
    filterRow: `<div class="wu-filter-row">
  <Woven::Field @label="Status">
    <Woven::Dropdown @align="start" @value={{this.filterStatus}} @onSelect={{this.setFilterStatus}} @options={{this.filterStatusOptions}} @placeholder="All" />
  </Woven::Field>
  <Woven::Field @label="Search">
    <Woven::Input @value={{this.filterSearch}} @onInput={{this.setFilterSearch}} @placeholder="Name or ID" />
  </Woven::Field>
  <div class="wu-field">
    <span class="wu-field__label-spacer" aria-hidden="true"></span>
    <Woven::Button @variant="secondary" @text="Clear" @onClick={{this.clearFilters}} />
  </div>
</div>`,
    actionsStart: `<Woven::FormActions>
  <Woven::Button @variant="primary" @text="Save" />
  <Woven::Button @variant="secondary" @text="Cancel" />
</Woven::FormActions>`,
    actionsEnd: `<Woven::FormActions @align="end">
  <Woven::Button @variant="secondary" @text="Cancel" />
  <Woven::Button @variant="primary" @text="Save" />
</Woven::FormActions>`,
    actionsBetween: `<Woven::FormActions @align="between">
  <Woven::Button @variant="ghost" @text="Delete" />
  <Woven::Button @variant="primary" @text="Save changes" />
</Woven::FormActions>`,
  };

  fieldArgRows = [
    { name: '@label', type: 'string', default: '', description: 'Label text. Linked to the first native control in the block by for/id.' },
    { name: '@required', type: 'boolean', default: 'false', description: 'Appends an aria-hidden asterisk to the label. Set required on the control itself as well.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Without @label: floating label text inside the control. The native placeholder becomes a single space.' },
    { name: '@hint', type: 'string', default: '', description: 'Helper text under the control. Hidden while @error is set. Colored by a warning or success status.' },
    { name: '@error', type: 'string', default: '', description: 'Error text with an icon; replaces the hint and implies status error.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'Validation status written onto the control. A status argument on the control itself wins.' },
    { name: '@invalid', type: 'boolean', default: 'false', description: 'Alias for @status="error".' },
    { name: '@valid', type: 'boolean', default: 'false', description: 'Alias for @status="success".' },
    { name: '@horizontal', type: 'boolean', default: 'false', description: 'Label and control side by side (m-horizontal).' },
    { name: '@flush', type: 'boolean', default: 'false', description: 'Removes the outer block margin (m-flush).' },
    { name: '@tooltip', type: 'string', default: '', description: 'Adds a question-mark button beside the label carrying this text as a tooltip.' },
    { name: '@tooltipPosition', type: '"top" | "bottom" | "start" | "end"', default: '"top"', description: 'Placement of the label tooltip.' },
  ];

  fieldBlockRows = [
    { name: 'default', description: 'The control. A native input, textarea or select receives the label id; a combobox, listbox or button falls back to aria-labelledby. Yields status, invalid, valid, required, controlId, labelId, hintId, errorId, describedBy and placeholder.' },
  ];

  groupArgRows = [
    { name: '@label', type: 'string', default: '', description: 'Legend text.' },
    { name: '@required', type: 'boolean', default: 'false', description: 'Asterisk on the legend.' },
    { name: '@hint', type: 'string', default: '', description: 'Helper text for the set.' },
    { name: '@error', type: 'string', default: '', description: 'Error for the set; implies status error.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'Written onto every control inside. @invalid and @valid alias it.' },
    { name: '@flush', type: 'boolean', default: 'false', description: 'Removes the outer block margin.' },
  ];

  actionsArgRows = [
    { name: '@align', type: '"end" | "between"', default: '', description: 'Aligns the buttons to the end of the row, or spreads them to both edges. Omit for start alignment.' },
  ];

  classRows = [
    { name: 'wu-filter-row', description: 'Auto-fitting grid of fields; the column count follows the viewport width.' },
    { name: 'wu-field__label-spacer', description: 'Empty label placeholder so an unlabelled control (a button) shares the baseline of its neighbours.' },
  ];
}

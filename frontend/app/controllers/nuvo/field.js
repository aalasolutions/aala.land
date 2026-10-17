import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class NuvoFieldController extends Controller {
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
    label: `<Nuvo::Field @label="Property name">
  <Nuvo::Input @placeholder="Marina Tower" />
</Nuvo::Field>`,
    required: `<Nuvo::Field @label="Property name" @required={{true}}>
  <Nuvo::Input @placeholder="Marina Tower" required />
</Nuvo::Field>`,
    hint: `<Nuvo::Field @label="Property name" @hint="Shown to tenants on the portal">
  <Nuvo::Input @placeholder="Marina Tower" />
</Nuvo::Field>`,
    error: `<Nuvo::Field @label="Monthly rent" @hint="Whole dirhams" @error="Rent must be greater than 0">
  <Nuvo::Input @value="-100" />
</Nuvo::Field>`,
    statuses: `<Nuvo::Field @label="Monthly rent" @error="Enter a rent greater than 0">
  <Nuvo::Input @value="-100" />
</Nuvo::Field>
<Nuvo::Field @label="Monthly rent" @status="warning" @hint="Above the area average; check the amount">
  <Nuvo::Input @value="400000" />
</Nuvo::Field>
<Nuvo::Field @label="Monthly rent" @status="success" @hint="Matches the signed lease">
  <Nuvo::Input @value="85000" />
</Nuvo::Field>`,
    statusControls: `<Nuvo::Field @label="Region" @error="Choose a region">
  <Nuvo::Select @options={{this.regionOptions}} @placeholder="Choose a region" />
</Nuvo::Field>
<Nuvo::Field @label="Terms" @error="Accept the terms to continue">
  <Nuvo::Checkbox @label="I accept the terms" />
</Nuvo::Field>`,
    liveError: `<Nuvo::Field @label="Cheque number" @hint="Six digits" @error={{this.chequeError}} @required={{true}}>
  <Nuvo::Input @value={{this.chequeNumber}} @inputmode="numeric" @onInput={{this.setChequeNumber}} pattern="[0-9]*" />
</Nuvo::Field>`,
    floating: `<Nuvo::Field @placeholder="Property name" @hint="Shown to tenants on the portal">
  <Nuvo::Input />
</Nuvo::Field>
<Nuvo::Field @placeholder="Region" as |f|>
  <Nuvo::Select @options={{this.regionOptions}} @placeholder={{f.placeholder}} />
</Nuvo::Field>`,
    fieldGroup: `<Nuvo::FieldGroup @label="Payment method" @required={{true}} @error="Choose how the tenant pays">
  <div class="nu-check-group">
    <Nuvo::Radio @name="pay" @value="cheque" @label="Cheque" />
    <Nuvo::Radio @name="pay" @value="transfer" @label="Bank transfer" />
  </div>
</Nuvo::FieldGroup>`,
    horizontal: `<Nuvo::Field @label="Region" @horizontal={{true}}>
  <Nuvo::Select @options={{this.regionOptions}} @placeholder="Choose a region" />
</Nuvo::Field>`,
    flush: `<Nuvo::Field @label="Region" @horizontal={{true}} @flush={{true}}>
  <Nuvo::Select @options={{this.regionOptions}} @placeholder="Choose a region" />
</Nuvo::Field>`,
    tooltip: `<Nuvo::Field
  @label="Tenancy Registration Ref"
  @tooltip="e.g. Ejari in Dubai, Tawtheeq in Abu Dhabi, or your local government lease registry number."
>
  <Nuvo::Input @placeholder="TR-2026-00001" />
</Nuvo::Field>`,
    tooltipPosition: `<Nuvo::Field @label="Deposit" @tooltip="Held until the lease ends." @tooltipPosition="end">
  <Nuvo::Input @placeholder="5%" />
</Nuvo::Field>`,
    combobox: `<Nuvo::Field @label="Status">
  <Nuvo::Dropdown @align="start" @options={{this.filterStatusOptions}} @placeholder="All" />
</Nuvo::Field>`,
    toggle: `<Nuvo::Field @label="Notify tenants" @horizontal={{true}}>
  <Nuvo::Toggle @checked={{this.notify}} @onChange={{this.setNotify}} />
</Nuvo::Field>`,
    filterRow: `<div class="nu-filter-row">
  <Nuvo::Field @label="Status">
    <Nuvo::Dropdown @align="start" @value={{this.filterStatus}} @onSelect={{this.setFilterStatus}} @options={{this.filterStatusOptions}} @placeholder="All" />
  </Nuvo::Field>
  <Nuvo::Field @label="Search">
    <Nuvo::Input @value={{this.filterSearch}} @onInput={{this.setFilterSearch}} @placeholder="Name or ID" />
  </Nuvo::Field>
  <div class="nu-field">
    <span class="nu-field__label-spacer" aria-hidden="true"></span>
    <Nuvo::Button @variant="secondary" @text="Clear" @onClick={{this.clearFilters}} />
  </div>
</div>`,
    actionsStart: `<Nuvo::FormActions>
  <Nuvo::Button @variant="primary" @text="Save" />
  <Nuvo::Button @variant="secondary" @text="Cancel" />
</Nuvo::FormActions>`,
    actionsEnd: `<Nuvo::FormActions @align="end">
  <Nuvo::Button @variant="secondary" @text="Cancel" />
  <Nuvo::Button @variant="primary" @text="Save" />
</Nuvo::FormActions>`,
    actionsBetween: `<Nuvo::FormActions @align="between">
  <Nuvo::Button @variant="ghost" @text="Delete" />
  <Nuvo::Button @variant="primary" @text="Save changes" />
</Nuvo::FormActions>`,
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
    { name: 'nu-filter-row', description: 'Auto-fitting grid of fields; the column count follows the viewport width.' },
    { name: 'nu-field__label-spacer', description: 'Empty label placeholder so an unlabelled control (a button) shares the baseline of its neighbours.' },
  ];
}

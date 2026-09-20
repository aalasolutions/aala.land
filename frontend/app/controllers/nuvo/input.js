import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const LTR_NOTES = {
  tel: 'Phone numbers keep their digit order and plus sign in an RTL page.',
  number: 'Numeric input; the spinner and digits stay left-to-right.',
  email: 'Addresses read as Latin text even under dir="rtl".',
  url: 'Links likewise stay left-to-right.',
};

const RESIZE_NOTES = {
  none: 'Fixed size, for a note field inside a tight dialog.',
  vertical: 'The user can grow it downwards only, the usual choice in forms.',
  horizontal: 'Width only; rare, for a code snippet field.',
  both: 'Free resize, for a large editor.',
};

export default class NuvoInputController extends Controller {
  @tracked inputValue = 'Marina Tower';
  @tracked clearableValue = 'Clear me';
  @tracked phoneValue = '+971 50 123 4567';
  @tracked textareaValue = 'Ground floor unit, sea view, needs minor touch-up before listing.';
  @tracked selectValue = 'dubai-marina';
  @tracked groupInputValue = '8500';
  @tracked changeCount = 0;

  regionOptions = [
    { value: 'dubai-marina', label: 'Dubai Marina' },
    { value: 'downtown', label: 'Downtown Dubai' },
    { value: 'jvc', label: 'JVC' },
  ];

  propertyTypeOptions = ['Villa', 'Apartment', 'Townhouse'];

  ltrExamples = Object.keys(LTR_NOTES).map((type) => ({
    type,
    title: `type ${type}`,
    note: LTR_NOTES[type],
    code: `<Nuvo::Input @type="${type}" @placeholder="${type}" />`,
  }));

  resizeExamples = Object.keys(RESIZE_NOTES).map((resize) => ({
    resize,
    title: `resize ${resize}`,
    note: RESIZE_NOTES[resize],
    code: `<Nuvo::Textarea @resize="${resize}" @rows={{2}} @placeholder="${resize}" />`,
  }));

  @action
  updateInput(value) {
    this.inputValue = value;
  }

  @action
  updateClearable(value) {
    this.clearableValue = value;
  }

  @action
  updatePhone(value) {
    this.phoneValue = value;
  }

  @action
  countChange() {
    this.changeCount += 1;
  }

  @action
  updateTextarea(value) {
    this.textareaValue = value;
  }

  @action
  updateSelect(value) {
    this.selectValue = value;
  }

  @action
  updateGroupInput(value) {
    this.groupInputValue = value;
  }

  code = {
    controlled: `<Nuvo::Input @value={{this.inputValue}} @placeholder="Property name" @onInput={{this.updateInput}} />`,
    change: `<Nuvo::Input @placeholder="Type, then blur or press Enter" @onChange={{this.countChange}} />`,
    clearable: `<Nuvo::Input @value={{this.clearableValue}} @clearable={{true}} @onInput={{this.updateClearable}} />`,
    prefix: `<Nuvo::Input @prefixIcon="⌕" @placeholder="Search units" />`,
    suffix: `<Nuvo::Input @suffixIcon="AED" @placeholder="Monthly rent" />`,
    sm: `<Nuvo::Input @size="sm" @placeholder="Small" />`,
    lg: `<Nuvo::Input @size="lg" @placeholder="Large" />`,
    invalid: `<Nuvo::Input @invalid={{true}} @value="-100" />`,
    valid: `<Nuvo::Input @valid={{true}} @value="Looks right" />`,
    disabled: `<Nuvo::Input @disabled={{true}} @value="Disabled" />`,
    readonly: `<Nuvo::Input @readonly={{true}} @value="Read only" />`,
    maxlength: `<Nuvo::Input @maxlength={{6}} @placeholder="Max 6 characters" />`,
    auto: `<Nuvo::Input @auto={{true}} @placeholder="Auto width" />`,
    textareaBasic: `<Nuvo::Textarea @value={{this.textareaValue}} @rows={{4}} @placeholder="Unit notes" @onInput={{this.updateTextarea}} />`,
    textareaInvalid: `<Nuvo::Textarea @invalid={{true}} @value="Too long for this field" @rows={{2}} />`,
    textareaDisabled: `<Nuvo::Textarea @disabled={{true}} @value="Disabled" @rows={{2}} />`,
    textareaReadonly: `<Nuvo::Textarea @readonly={{true}} @value="Read only" @rows={{2}} />`,
    textareaMaxlength: `<Nuvo::Textarea @maxlength={{80}} @rows={{2}} @placeholder="Max 80 characters" />`,
    selectBasic: `<Nuvo::Select @value={{this.selectValue}} @options={{this.regionOptions}} @onChange={{this.updateSelect}} />

// regionOptions: [{ value: 'dubai-marina', label: 'Dubai Marina' }, ...]`,
    selectStrings: `<Nuvo::Select @options={{this.propertyTypeOptions}} @placeholder="Choose a property type" />

// propertyTypeOptions: ['Villa', 'Apartment', 'Townhouse']`,
    selectSm: `<Nuvo::Select @size="sm" @options={{this.propertyTypeOptions}} @placeholder="Small" />`,
    selectLg: `<Nuvo::Select @size="lg" @options={{this.propertyTypeOptions}} @placeholder="Large" />`,
    selectDisabled: `<Nuvo::Select @disabled={{true}} @options={{this.propertyTypeOptions}} @placeholder="Disabled" />`,
    prepend: `<Nuvo::InputGroup @prepend="https://">
  <Nuvo::Input @placeholder="your-domain.com" />
</Nuvo::InputGroup>`,
    append: `<Nuvo::InputGroup @append="AED / month">
  <Nuvo::Input @placeholder="0" />
</Nuvo::InputGroup>`,
    both: `<Nuvo::InputGroup @prepend="AED" @append=".00">
  <Nuvo::Input @value={{this.groupInputValue}} @onInput={{this.updateGroupInput}} />
</Nuvo::InputGroup>`,
  };

  inputArgRows = [
    { name: '@value', type: 'string | number', default: '', description: 'Current value. The component is controlled; update it from @onInput.' },
    { name: '@type', type: 'string', default: '"text"', description: 'Native input type. tel, number, email and url are pinned to dir="ltr".' },
    { name: '@size', type: '"sm" | "lg"', default: '', description: 'Height step.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Native placeholder.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute; hides the clear button.' },
    { name: '@readonly', type: 'boolean', default: 'false', description: 'Native readonly attribute; hides the clear button.' },
    { name: '@maxlength', type: 'number', default: '', description: 'Native maxlength.' },
    { name: '@autocomplete', type: 'string', default: '"off"', description: 'Native autocomplete token.' },
    { name: '@invalid', type: 'boolean', default: 'false', description: 'Adds is-invalid and aria-invalid="true".' },
    { name: '@valid', type: 'boolean', default: 'false', description: 'Adds is-valid. Ignored when @invalid is set.' },
    { name: '@auto', type: 'boolean', default: 'false', description: 'Adds m-auto so the input sizes to its content instead of filling the row.' },
    { name: '@clearable', type: 'boolean', default: 'false', description: 'Shows a clear button whenever there is a value.' },
    { name: '@prefixIcon', type: 'string', default: '', description: 'Glyph rendered before the input inside the wrap.' },
    { name: '@suffixIcon', type: 'string', default: '', description: 'Glyph rendered after the input. Replaced by the clear button while clearable and non-empty.' },
  ];

  inputCallbackRows = [
    { name: '@onInput', signature: '(value, event)', description: 'Every input event, with the string value first.' },
    { name: '@onChange', signature: '(value, event)', description: 'Native change event (blur or Enter).' },
    { name: '@onClear', signature: '()', description: 'Clear button pressed. @onInput is also called with an empty string.' },
  ];

  textareaArgRows = [
    { name: '@value', type: 'string', default: '', description: 'Current value; update it from @onInput.' },
    { name: '@rows', type: 'number', default: '3', description: 'Visible rows.' },
    { name: '@resize', type: '"none" | "both" | "horizontal" | "vertical"', default: '', description: 'CSS resize behaviour. Unknown values leave the browser default.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Native placeholder.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute.' },
    { name: '@readonly', type: 'boolean', default: 'false', description: 'Native readonly attribute.' },
    { name: '@maxlength', type: 'number', default: '', description: 'Native maxlength.' },
    { name: '@invalid', type: 'boolean', default: 'false', description: 'Adds is-invalid and aria-invalid="true".' },
  ];

  textareaCallbackRows = [
    { name: '@onInput', signature: '(value, event)', description: 'Every input event.' },
    { name: '@onChange', signature: '(value, event)', description: 'Native change event.' },
  ];

  selectArgRows = [
    { name: '@value', type: 'string | number', default: '', description: 'Selected option value.' },
    { name: '@options', type: 'array', default: '[]', description: 'Strings, or objects with value and label.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Renders a disabled first option, selected while nothing matches @value.' },
    { name: '@size', type: '"sm" | "lg"', default: '', description: 'Height step.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute.' },
  ];

  selectCallbackRows = [
    { name: '@onChange', signature: '(value, event)', description: 'Selection changed. The value is the option value as a string.' },
  ];

  groupArgRows = [
    { name: '@prepend', type: 'string', default: '', description: 'Addon text before the control.' },
    { name: '@append', type: 'string', default: '', description: 'Addon text after the control.' },
  ];

  groupBlockRows = [
    { name: 'default', description: 'The control, usually a Nuvo::Input.' },
  ];
}

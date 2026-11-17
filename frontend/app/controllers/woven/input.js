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
  vertical: 'The user can grow it downward only, the usual choice in forms.',
  horizontal: 'Width only; rare, for a code snippet field.',
  both: 'Free resize, for a large editor.',
};

export default class WovenInputController extends Controller {
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
    code: `<Woven::Input @type="${type}" @placeholder="${type}" />`,
  }));

  resizeExamples = Object.keys(RESIZE_NOTES).map((resize) => ({
    resize,
    title: `resize ${resize}`,
    note: RESIZE_NOTES[resize],
    code: `<Woven::Textarea @resize="${resize}" @rows={{2}} @placeholder="${resize}" />`,
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
    controlled: `<Woven::Input @value={{this.inputValue}} @placeholder="Property name" @onInput={{this.updateInput}} />`,
    change: `<Woven::Input @placeholder="Type, then blur or press Enter" @onChange={{this.countChange}} />`,
    clearable: `<Woven::Input @value={{this.clearableValue}} @clearable={{true}} @onInput={{this.updateClearable}} />`,
    prefix: `<Woven::Input @prefixIcon="⌕" @placeholder="Search units" />`,
    suffix: `<Woven::Input @suffixIcon="AED" @placeholder="Monthly rent" />`,
    sm: `<Woven::Input @size="sm" @placeholder="Small" />`,
    lg: `<Woven::Input @size="lg" @placeholder="Large" />`,
    invalid: `<Woven::Input @invalid={{true}} @value="-100" />`,
    valid: `<Woven::Input @valid={{true}} @value="Looks right" />`,
    disabled: `<Woven::Input @disabled={{true}} @value="Disabled" />`,
    readonly: `<Woven::Input @readonly={{true}} @value="Read only" />`,
    maxlength: `<Woven::Input @maxlength={{6}} @placeholder="Max 6 characters" />`,
    textareaBasic: `<Woven::Textarea @value={{this.textareaValue}} @rows={{4}} @placeholder="Unit notes" @onInput={{this.updateTextarea}} />`,
    textareaInvalid: `<Woven::Textarea @invalid={{true}} @value="Too long for this field" @rows={{2}} />`,
    textareaDisabled: `<Woven::Textarea @disabled={{true}} @value="Disabled" @rows={{2}} />`,
    textareaReadonly: `<Woven::Textarea @readonly={{true}} @value="Read only" @rows={{2}} />`,
    textareaMaxlength: `<Woven::Textarea @maxlength={{80}} @rows={{2}} @placeholder="Max 80 characters" />`,
    selectBasic: `<Woven::Select @value={{this.selectValue}} @options={{this.regionOptions}} @onChange={{this.updateSelect}} />

// regionOptions: [{ value: 'dubai-marina', label: 'Dubai Marina' }, ...]`,
    selectStrings: `<Woven::Select @options={{this.propertyTypeOptions}} @placeholder="Choose a property type" />

// propertyTypeOptions: ['Villa', 'Apartment', 'Townhouse']`,
    selectSm: `<Woven::Select @size="sm" @options={{this.propertyTypeOptions}} @placeholder="Small" />`,
    selectLg: `<Woven::Select @size="lg" @options={{this.propertyTypeOptions}} @placeholder="Large" />`,
    selectDisabled: `<Woven::Select @disabled={{true}} @options={{this.propertyTypeOptions}} @placeholder="Disabled" />`,
    prepend: `<Woven::InputGroup @prepend="https://">
  <Woven::Input @placeholder="your-domain.com" />
</Woven::InputGroup>`,
    append: `<Woven::InputGroup @append="AED / month">
  <Woven::Input @placeholder="0" />
</Woven::InputGroup>`,
    both: `<Woven::InputGroup @prepend="AED" @append=".00">
  <Woven::Input @value={{this.groupInputValue}} @onInput={{this.updateGroupInput}} />
</Woven::InputGroup>`,
    groupSizes: `<Woven::InputGroup @prepend="AED">
  <Woven::Input @size="sm" @placeholder="Small" />
</Woven::InputGroup>
<Woven::InputGroup @prepend="AED">
  <Woven::Input @placeholder="Default" />
</Woven::InputGroup>
<Woven::InputGroup @prepend="AED">
  <Woven::Input @size="lg" @placeholder="Large" />
</Woven::InputGroup>`,
  };

  inputArgRows = [
    { name: '@value', type: 'string | number', default: '', description: 'Current value. The component is controlled; update it from @onInput.' },
    { name: '@type', type: 'string', default: '"text"', description: 'Native input type. tel, number, email and url are pinned to dir="ltr".' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg (on the wu-input-affix wrapper when there is one); xs renders sm and xl renders lg.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Native placeholder.' },
    { name: '@inputmode', type: 'string', default: '', description: 'Native inputmode: tel for phones, numeric for codes and postal numbers.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute; hides the clear button.' },
    { name: '@readonly', type: 'boolean', default: 'false', description: 'Native readonly attribute; hides the clear button.' },
    { name: '@maxlength', type: 'number', default: '', description: 'Native maxlength.' },
    { name: '@autocomplete', type: 'string', default: '"off"', description: 'Native autocomplete token.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'Sets data-wu-status; error also sets aria-invalid="true", the only state the kit styles. Wins over @invalid and @valid.' },
    { name: '@invalid', type: 'boolean', default: 'false', description: 'Alias of @status="error".' },
    { name: '@valid', type: 'boolean', default: 'false', description: 'Alias of @status="success"; no visual style. Ignored when @invalid is set.' },
    { name: '@clearable', type: 'boolean', default: 'false', description: 'Shows the kit wu-input-clear button whenever there is a value.' },
    { name: '@prefixIcon', type: 'string', default: '', description: 'Text or glyph in the kit wu-input-prefix, inside the wu-input-affix wrapper.' },
    { name: '@suffixIcon', type: 'string', default: '', description: 'Text or glyph in the kit wu-input-suffix. Replaced by the clear button while clearable and non-empty.' },
  ];

  inputCallbackRows = [
    { name: '@onInput', signature: '(value, event)', description: 'Every input event, with the string value first.' },
    { name: '@onChange', signature: '(value, event)', description: 'Native change event (blur or Enter).' },
    { name: '@onClear', signature: '()', description: 'Clear button pressed. @onInput is also called with an empty string.' },
  ];

  textareaArgRows = [
    { name: '@value', type: 'string', default: '', description: 'Current value; update it from @onInput.' },
    { name: '@rows', type: 'number', default: '3', description: 'Visible rows.' },
    { name: '@resize', type: '"none" | "both" | "horizontal" | "vertical"', default: '', description: 'CSS resize behavior. Unknown values leave the kit default.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Native placeholder.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute.' },
    { name: '@readonly', type: 'boolean', default: 'false', description: 'Native readonly attribute.' },
    { name: '@maxlength', type: 'number', default: '', description: 'Native maxlength.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'As on Input: data-wu-status, and aria-invalid for error.' },
    { name: '@invalid', type: 'boolean', default: 'false', description: 'Alias of @status="error".' },
    { name: '@valid', type: 'boolean', default: 'false', description: 'Alias of @status="success".' },
  ];

  textareaCallbackRows = [
    { name: '@onInput', signature: '(value, event)', description: 'Every input event.' },
    { name: '@onChange', signature: '(value, event)', description: 'Native change event.' },
  ];

  selectArgRows = [
    { name: '@value', type: 'string | number', default: '', description: 'Selected option value.' },
    { name: '@options', type: 'array', default: '[]', description: 'Strings, or objects with value and label.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Renders a disabled first option, selected while nothing matches @value.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg; xs renders sm and xl renders lg.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Native disabled attribute.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'As on Input; @invalid and @valid are aliases.' },
  ];

  selectCallbackRows = [
    { name: '@onChange', signature: '(value, event)', description: 'Selection changed. The value is the option value as a string.' },
  ];

  groupArgRows = [
    { name: '@prepend', type: 'string', default: '', description: 'Kit wu-input-group-text addon before the control.' },
    { name: '@append', type: 'string', default: '', description: 'Kit wu-input-group-text addon after the control.' },
  ];

  groupBlockRows = [
    { name: 'default', description: 'The control, usually a Woven::Input.' },
  ];
}

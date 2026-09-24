import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { runTask } from 'ember-lifeline';

const REMOTE_DELAY = 400;

const ALIGN_NOTES = {
  start: 'Trigger text at the start, select-like, and the menu at least as wide as the trigger. The form to use inside a Field.',
  center: 'Centred trigger label; the options keep their own alignment.',
  end: 'Trigger label at the end, for a control sitting at the end of a toolbar.',
};

export default class NuvoDropdownController extends Controller {
  @tracked dropdownValue = 'downtown';
  @tracked actionResult = 'none yet';
  @tracked filterValue = undefined;
  @tracked remoteValue = undefined;
  @tracked remoteLabel = '';
  @tracked createdOptions = [];
  @tracked uncontrolledPick = 'none yet';

  // Long enough to cross the 8-option search threshold.
  areaOptions = [
    { value: 'dubai-marina', label: 'Dubai Marina', group: 'Dubai' },
    { value: 'downtown', label: 'Downtown Dubai', group: 'Dubai' },
    { value: 'jbr', label: 'JBR', group: 'Dubai' },
    { value: 'jvc', label: 'JVC', group: 'Dubai' },
    { value: 'business-bay', label: 'Business Bay', group: 'Dubai' },
    { value: 'yas', label: 'Yas Island', group: 'Abu Dhabi' },
    { value: 'reem', label: 'Al Reem Island', group: 'Abu Dhabi' },
    { value: 'saadiyat', label: 'Saadiyat Island', group: 'Abu Dhabi' },
    { value: 'corniche', label: 'Corniche', group: 'Abu Dhabi' },
    { value: 'muraqqabat', label: 'Al Muraqqabat', group: 'Deira' },
  ];

  propertyTypeOptions = ['Villa', 'Apartment', 'Townhouse'];

  iconOptions = [
    { value: 'villa', label: 'Villa', icon: '🏡' },
    { value: 'apartment', label: 'Apartment', icon: '🏢' },
    { value: 'office', label: 'Office', icon: '🏬', disabled: true },
  ];

  rowActions = [
    { value: 'edit', label: 'Edit', icon: '✎' },
    { value: 'duplicate', label: 'Duplicate', icon: '⧉' },
    { value: 'archive', label: 'Archive', icon: '⌸', disabled: true },
    { separator: true },
    { value: 'delete', label: 'Delete', icon: '✕', danger: true },
  ];

  alignExamples = Object.keys(ALIGN_NOTES).map((align) => ({
    align,
    title: `align ${align}`,
    note: ALIGN_NOTES[align],
    code: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Align ${align}" @align="${align}" />`,
  }));

  get creatableOptions() {
    return [...this.propertyTypeOptions, ...this.createdOptions];
  }

  @action
  updateDropdown(value) {
    this.dropdownValue = value;
  }

  @action
  runAction(value) {
    this.actionResult = value;
  }

  @action
  notePick(value) {
    this.uncontrolledPick = value;
  }

  @action
  updateFilter(value) {
    this.filterValue = value;
  }

  @action
  clearFilter() {
    this.filterValue = undefined;
  }

  // Stands in for a network search: resolves a filtered slice after a short delay.
  @action
  searchAreas(term) {
    const needle = term.toLowerCase();
    return new Promise((resolve) => {
      runTask(
        this,
        () => {
          resolve(
            this.areaOptions.filter((area) =>
              area.label.toLowerCase().includes(needle),
            ),
          );
        },
        REMOTE_DELAY,
      );
    });
  }

  @action
  selectRemote(value, option) {
    this.remoteValue = value;
    this.remoteLabel = option.label;
  }

  @action
  clearRemote() {
    this.remoteValue = undefined;
    this.remoteLabel = '';
  }

  @action
  createType(term) {
    const created = { value: term.toLowerCase(), label: term };
    this.createdOptions = [...this.createdOptions, created];
    return created;
  }

  @action
  selectCreated(value) {
    this.actionResult = `selected ${value}`;
  }

  code = {
    controlled: `<Nuvo::Dropdown
  @options={{this.areaOptions}}
  @value={{this.dropdownValue}}
  @placeholder="Select an area"
  @onSelect={{this.updateDropdown}}
/>

// areaOptions: [{ value: 'dubai-marina', label: 'Dubai Marina', group: 'Dubai' }, ...] (10 options, 3 groups)`,
    uncontrolled: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Pick a type" @onSelect={{this.notePick}} />`,
    strings: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="No search (3 options)" />`,
    icons: `<Nuvo::Dropdown @options={{this.iconOptions}} @placeholder="With icons" />

// iconOptions: [{ value: 'villa', label: 'Villa', icon: '🏡' }, ..., { value: 'office', label: 'Office', icon: '🏬', disabled: true }]`,
    searchableOff: `<Nuvo::Dropdown @options={{this.areaOptions}} @placeholder="Search suppressed" @searchable={{false}} />`,
    threshold: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Search from 2 options" @searchThreshold={{2}} @searchPlaceholder="Filter types" />`,
    up: `<Nuvo::Dropdown @options={{this.areaOptions}} @placeholder="Opens upward" @placement="up" />`,
    placementStart: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Menu at start edge" @placement="start" />`,
    placementEnd: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Menu at end edge" @placement="end" />`,
    optionsAlign: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Centred options" @align="end" @optionsAlign="center" />`,
    disabled: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Disabled" @disabled={{true}} />`,
    size: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Small" @size="sm" />`,
    triggerVariant: `<Nuvo::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Primary trigger" @triggerVariant="primary" />`,
    trigger: `<Nuvo::Dropdown @options={{this.rowActions}} @onSelect={{this.runAction}} @searchable={{false}} @optionsAlign="center">
  <:trigger as |toggle isOpen|>
    <Nuvo::Button
      @variant="secondary"
      @icon="dots-three"
      @shape="square"
      @onClick={{toggle}}
      aria-label="Row actions"
      aria-expanded={{if isOpen "true" "false"}}
    />
  </:trigger>
</Nuvo::Dropdown>

// rowActions: [{ value, label, icon }, { value, label, icon, disabled: true }, { separator: true }, { value, label, icon, danger: true }]`,
    filterable: `<Nuvo::Dropdown
  @filterable={{true}}
  @options={{this.areaOptions}}
  @value={{this.filterValue}}
  @placeholder="Type to filter areas"
  @onSelect={{this.updateFilter}}
  @onClear={{this.clearFilter}}
/>`,
    remote: `<Nuvo::Dropdown
  @filterable={{true}}
  @remote={{true}}
  @minChars={{2}}
  @searchDebounce={{250}}
  @promptText="Type two letters"
  @emptyText="No areas match"
  @value={{this.remoteValue}}
  @selectedLabel={{this.remoteLabel}}
  @placeholder="Search areas (remote)"
  @onSearch={{this.searchAreas}}
  @onSelect={{this.selectRemote}}
  @onClear={{this.clearRemote}}
/>

// searchAreas(term) returns a Promise of [{ value, label, group? }]`,
    create: `<Nuvo::Dropdown
  @filterable={{true}}
  @allowCreate={{true}}
  @options={{this.creatableOptions}}
  @placeholder="Pick or add a type"
  @onCreate={{this.createType}}
  @onSelect={{this.selectCreated}}
/>

// createType(term) returns { value, label }; the new value is selected`,
    autocomplete: `<Nuvo::Autocomplete
  @searchUrl="/contacts/search"
  @labelKey="name"
  @createUrl="/contacts"
  @createPayload={{hash type="tenant"}}
  @value={{this.tenantId}}
  @selectedName={{this.tenantName}}
  @placeholder="Search tenants"
  @onSelect={{this.pickTenant}}
  @onClear={{this.clearTenant}}
/>`,
  };

  argRows = [
    { name: '@options', type: 'array', default: '[]', description: 'Strings, or objects with value, label, group, icon, danger, disabled, separator. Ignored when @remote.' },
    { name: '@value', type: 'any', default: '', description: 'Controlled selected value. Omit for uncontrolled mode.' },
    { name: '@placeholder', type: 'string', default: '"Select..."', description: 'Trigger label while nothing is selected; input placeholder when filterable.' },
    { name: '@placement', type: '"start" | "end" | "up"', default: '', description: 'Menu position: aligned to the start or end edge, or opening upward.' },
    { name: '@align', type: '"start" | "center" | "end"', default: '', description: 'Select-like trigger text alignment. Any value also makes the menu at least as wide as the trigger.' },
    { name: '@optionsAlign', type: '"start" | "center" | "end"', default: '', description: 'Text alignment inside the menu, independent of the trigger.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Disables the trigger.' },
    { name: '@size', type: '"xs" | "sm" | "lg"', default: '', description: 'Forwarded to the trigger button or filter input.' },
    { name: '@triggerVariant', type: 'string', default: '"secondary"', description: 'Button variant for the default trigger.' },
    { name: '@searchable', type: 'boolean', default: '', description: 'Set false to suppress the in-menu search that appears past the threshold.' },
    { name: '@searchThreshold', type: 'number', default: '8', description: 'Option count above which the in-menu search renders.' },
    { name: '@searchPlaceholder', type: 'string', default: '"Search..."', description: 'Placeholder of the in-menu search.' },
    { name: '@filterable', type: 'boolean', default: 'false', description: 'Replaces the trigger button with a combobox input that filters the options.' },
    { name: '@remote', type: 'boolean', default: 'false', description: 'Options come from @onSearch instead of @options. Use with @filterable.' },
    { name: '@minChars', type: 'number', default: '1', description: 'Characters required before a remote search or a create row.' },
    { name: '@searchDebounce', type: 'number', default: '250', description: 'Milliseconds between the last keystroke and @onSearch.' },
    { name: '@allowCreate', type: 'boolean', default: 'false', description: 'Offers an "Add" row for a term that matches no option.' },
    { name: '@selectedLabel', type: 'string', default: '', description: 'Label to show for a value not present in the options (remote selections).' },
    { name: '@promptText', type: 'string', default: '"Type to search"', description: 'Empty-menu text before a remote search.' },
    { name: '@emptyText', type: 'string', default: '"No results found"', description: 'Empty-menu text after a search.' },
  ];

  callbackRows = [
    { name: '@onSelect', signature: '(value, option)', description: 'An option was chosen, or a created option resolved.' },
    { name: '@onSearch', signature: '(term) => Promise<array>', description: 'Remote search. Resolve an array of options; stale results are discarded.' },
    { name: '@onCreate', signature: '(term) => Promise<option>', description: 'Create row chosen. Resolve an object with value (or id) and label; it becomes the selection. Resolve null to close without selecting.' },
    { name: '@onClear', signature: '()', description: 'Filter input cleared, or a remote selection erased by emptying the input.' },
  ];

  blockRows = [
    { name: 'trigger', description: 'Custom trigger. Yields (toggle, isOpen); call toggle from the control.' },
  ];

  optionRows = [
    { name: 'value', type: 'any', default: '', description: 'Reported to onSelect. A plain string option is both value and label.' },
    { name: 'label', type: 'string', default: 'value', description: 'Visible text; also what the search matches.' },
    { name: 'group', type: 'string', default: '', description: 'Group heading; grouped options are kept contiguous.' },
    { name: 'icon', type: 'string', default: '', description: 'Glyph before the label.' },
    { name: 'disabled', type: 'boolean', default: 'false', description: 'Rendered but not selectable.' },
    { name: 'danger', type: 'boolean', default: 'false', description: 'Red text for destructive actions.' },
    { name: 'separator', type: 'boolean', default: 'false', description: 'Renders a divider instead of an item; only in flat, unfiltered menus.' },
  ];

  autocompleteArgRows = [
    { name: '@searchUrl', type: 'string', default: '', description: 'Endpoint queried with the search term appended as a query param.' },
    { name: '@searchParam', type: 'string', default: '"q"', description: 'Query param name for the term.' },
    { name: '@labelKey', type: 'string', default: '"name"', description: 'Property of each result used as the label; id is the value.' },
    { name: '@createUrl', type: 'string', default: '', description: 'POST endpoint for creating a record from the typed term. Enables the create row.' },
    { name: '@createPayload', type: 'object', default: '', description: 'Extra fields merged into the create body beside name.' },
    { name: '@value', type: 'any', default: '', description: 'Selected record id.' },
    { name: '@selectedName', type: 'string', default: '', description: 'Label of the selected record.' },
    { name: '@minChars', type: 'number', default: '2', description: 'Characters required before searching.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Input placeholder.' },
    { name: '@promptText', type: 'string', default: '', description: 'Forwarded to Nuvo::Dropdown.' },
    { name: '@emptyText', type: 'string', default: '', description: 'Forwarded to Nuvo::Dropdown.' },
    { name: '@searchDebounce', type: 'number', default: '', description: 'Forwarded to Nuvo::Dropdown.' },
    { name: '@size', type: 'string', default: '', description: 'Forwarded to Nuvo::Dropdown.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Forwarded to Nuvo::Dropdown.' },
  ];

  autocompleteCallbackRows = [
    { name: '@onSelect', signature: '(record)', description: 'The full record from the search or create response.' },
    { name: '@onClear', signature: '()', description: 'Selection erased.' },
  ];
}

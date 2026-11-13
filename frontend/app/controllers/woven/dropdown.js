import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { runTask } from 'ember-lifeline';

const REMOTE_DELAY = 400;

const ALIGN_NOTES = {
  start: 'Trigger text at the start, select-like, and the menu at least as wide as the trigger. The form to use inside a Field.',
  center: 'Centered trigger label; the options keep their own alignment.',
  end: 'Trigger label at the end, for a control sitting at the end of a toolbar.',
};

export default class WovenDropdownController extends Controller {
  @tracked dropdownValue = 'downtown';
  @tracked actionResult = 'none yet';
  @tracked filterValue = undefined;
  @tracked remoteValue = undefined;
  @tracked remoteLabel = '';
  @tracked createdOptions = [];
  @tracked uncontrolledPick = 'none yet';
  @tracked openCount = 0;
  @tracked sortOrder = 'newest';
  @tracked buildingId = undefined;
  @tracked buildingName = '';
  @tracked tenantId = undefined;
  @tracked tenantName = '';
  @tracked createdTenants = [];

  buildings = [
    { id: '1', name: 'Marina Tower' },
    { id: '2', name: 'Bay Square' },
    { id: '3', name: 'Sky Gardens' },
    { id: '4', name: 'Park Heights' },
  ];

  tenants = [
    { id: 't1', name: 'Ahmed Khalid' },
    { id: 't2', name: 'Sara Haddad' },
    { id: 't3', name: 'Omar Farouk' },
    { id: 't4', name: 'Layla Nasser' },
  ];

  sortChoices = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'rent', label: 'Highest rent' },
  ];

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
    code: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Align ${align}" @align="${align}" />`,
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
  noteOpen() {
    this.openCount += 1;
  }

  @action
  pickSort(value) {
    this.sortOrder = value;
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
  pickBuilding(record) {
    this.buildingId = record.id;
    this.buildingName = record.name;
  }

  @action
  clearBuilding() {
    this.buildingId = undefined;
    this.buildingName = '';
  }

  // Stands in for a network search over tenant records.
  @action
  searchTenants(term) {
    const needle = term.toLowerCase();
    const all = [...this.tenants, ...this.createdTenants];
    return new Promise((resolve) => {
      runTask(
        this,
        () => resolve(all.filter((tenant) => tenant.name.toLowerCase().includes(needle))),
        REMOTE_DELAY,
      );
    });
  }

  @action
  createTenant(term) {
    const created = { id: `new-${this.createdTenants.length + 1}`, name: term };
    this.createdTenants = [...this.createdTenants, created];
    return created;
  }

  @action
  pickTenant(record) {
    this.tenantId = record.id;
    this.tenantName = record.name;
  }

  @action
  clearTenant() {
    this.tenantId = undefined;
    this.tenantName = '';
  }

  @action
  selectCreated(value) {
    this.actionResult = `selected ${value}`;
  }

  code = {
    controlled: `<Woven::Dropdown
  @options={{this.areaOptions}}
  @value={{this.dropdownValue}}
  @placeholder="Select an area"
  @onSelect={{this.updateDropdown}}
/>

// areaOptions: [{ value: 'dubai-marina', label: 'Dubai Marina', group: 'Dubai' }, ...] (10 options, 3 groups)`,
    uncontrolled: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Pick a type" @onSelect={{this.notePick}} />`,
    strings: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="No search (3 options)" />`,
    icons: `<Woven::Dropdown @options={{this.iconOptions}} @placeholder="With icons" />

// iconOptions: [{ value: 'villa', label: 'Villa', icon: '🏡' }, ..., { value: 'office', label: 'Office', icon: '🏬', disabled: true }]`,
    searchableOff: `<Woven::Dropdown @options={{this.areaOptions}} @placeholder="Search suppressed" @searchable={{false}} />`,
    threshold: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Search from 2 options" @searchThreshold={{2}} @searchPlaceholder="Filter types" />`,
    up: `<Woven::Dropdown @options={{this.areaOptions}} @placeholder="Opens upward" @placement="up" />`,
    placementStart: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Menu at start edge" @placement="start" />`,
    placementEnd: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Menu at end edge" @placement="end" />`,
    optionsAlign: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Centered options" @align="end" @optionsAlign="center" />`,
    disabled: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Disabled" @disabled={{true}} />`,
    size: `<Woven::Dropdown @options={{this.propertyTypeOptions}} @placeholder="Small" @size="sm" />`,
    trigger: `<Woven::Dropdown @options={{this.rowActions}} @onSelect={{this.runAction}} @searchable={{false}} @optionsAlign="center">
  <:trigger as |toggle isOpen|>
    <Woven::Button
      @icon="dots-three"
      @shape="square"
      @onClick={{toggle}}
      aria-label="Row actions"
      aria-expanded={{if isOpen "true" "false"}}
    />
  </:trigger>
</Woven::Dropdown>

// rowActions: [{ value, label, icon }, { value, label, icon, disabled: true }, { separator: true }, { value, label, icon, danger: true }]`,
    menuBlock: `<Woven::Dropdown @onOpen={{this.noteOpen}}>
  <:trigger as |toggle isOpen|>
    <Woven::Button
      @text="Sort"
      @onClick={{toggle}}
      class="caret"
      aria-haspopup="menu"
      aria-expanded={{if isOpen "true" "false"}}
    />
  </:trigger>
  <:menu as |close|>
    <div role="group" aria-label="Sort">
    {{#each this.sortChoices as |choice|}}
      <button
        type="button"
        class="wu-dropdown-item"
        role="menuitemradio"
        aria-checked={{if (eq this.sortOrder choice.value) "true" "false"}}
        tabindex="-1"
        {{on "click" (fn this.pickSort choice.value)}}
      >{{choice.label}}</button>
    {{/each}}
    <hr class="wu-dropdown-separator" />
    <LinkTo @route="woven.index" class="wu-dropdown-item" role="menuitem" tabindex="-1">Overview page</LinkTo>
    <button type="button" class="wu-dropdown-item" role="menuitem" tabindex="-1" {{on "click" close}}>Close</button>
    </div>
  </:menu>
</Woven::Dropdown>`,
    filterable: `<Woven::Dropdown
  @filterable={{true}}
  @options={{this.areaOptions}}
  @value={{this.filterValue}}
  @placeholder="Type to filter areas"
  @onSelect={{this.updateFilter}}
  @onClear={{this.clearFilter}}
/>`,
    remote: `<Woven::Dropdown
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
    create: `<Woven::Dropdown
  @filterable={{true}}
  @allowCreate={{true}}
  @options={{this.creatableOptions}}
  @placeholder="Pick or add a type"
  @onCreate={{this.createType}}
  @onSelect={{this.selectCreated}}
/>

// createType(term) returns { value, label }; the new value is selected`,
    autocompleteLocal: `<Woven::Autocomplete
  @options={{this.buildings}}
  @value={{this.buildingId}}
  @selectedName={{this.buildingName}}
  @placeholder="Search buildings"
  @onSelect={{this.pickBuilding}}
  @onClear={{this.clearBuilding}}
/>

// buildings: [{ id: '1', name: 'Marina Tower' }, ...]; onSelect receives the record`,
    autocompleteRemote: `<Woven::Autocomplete
  @value={{this.tenantId}}
  @selectedName={{this.tenantName}}
  @placeholder="Search tenants"
  @onSearch={{this.searchTenants}}
  @onCreate={{this.createTenant}}
  @onSelect={{this.pickTenant}}
  @onClear={{this.clearTenant}}
/>

// searchTenants(term) returns a Promise of records; createTenant(term) returns the new record`,
  };

  argRows = [
    { name: '@options', type: 'array', default: '[]', description: 'Strings, or objects with value, label, group, icon, danger, disabled, separator. Ignored when @remote.' },
    { name: '@value', type: 'any', default: '', description: 'Controlled selected value. Omit for uncontrolled mode.' },
    { name: '@placeholder', type: 'string', default: '"Select..."', description: 'Trigger label while nothing is selected; input placeholder when filterable.' },
    { name: '@placement', type: '"start" | "end" | "up"', default: '', description: 'Menu position: below and start-aligned by default, end-aligned with end, above the trigger with up.' },
    { name: '@align', type: '"start" | "center" | "end"', default: '', description: 'Select-like trigger text alignment. Any value also makes the menu at least as wide as the trigger.' },
    { name: '@optionsAlign', type: '"start" | "center" | "end"', default: '', description: 'Text alignment inside the menu, independent of the trigger.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Disables the trigger.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg on the button.wu-select trigger, or forwarded to the filter input; xs renders sm and xl renders lg.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'On the trigger or the filter input; error sets aria-invalid, the only state the kit styles. @invalid and @valid alias it.' },
    { name: '@filter', type: '(options, term) => array', default: '', description: 'Custom local match for the in-menu search and filterable mode.' },
    { name: '@searchable', type: 'boolean', default: '', description: 'Set false to suppress the in-menu search that appears past the threshold.' },
    { name: '@searchThreshold', type: 'number', default: '8', description: 'Option count above which the in-menu search renders.' },
    { name: '@searchPlaceholder', type: 'string', default: '"Search..."', description: 'Placeholder of the in-menu search.' },
    { name: '@filterable', type: 'boolean', default: 'false', description: 'Replaces the trigger button with a combobox input that filters the options.' },
    { name: '@remote', type: 'boolean', default: 'false', description: 'Options come from @onSearch instead of @options. Use with @filterable.' },
    { name: '@minChars', type: 'number', default: '1', description: 'Characters required before a remote search or a create row.' },
    { name: '@searchDebounce', type: 'number', default: '250', description: 'Milliseconds between the last keystroke and @onSearch.' },
    { name: '@searchOnOpen', type: 'boolean', default: 'false', description: 'With @remote: calls @onSearch with an empty term when the menu opens (once per instance), so a first page shows before typing. The current @selectedLabel pick stays pinned in that list.' },
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
    { name: '@onOpen', signature: '()', description: 'The menu opened; load data the menu shows.' },
  ];

  blockRows = [
    { name: 'trigger', description: 'Custom trigger. Yields (toggle, isOpen); call toggle from the control.' },
    { name: 'menu', description: 'With a trigger block: your own items inside the kit wu-dropdown menu, in place of @options. Yields (close). Give each item role="menuitem" (or menuitemradio) and wu-dropdown-item; arrows move focus between them and a click on one closes the menu after its own handlers.' },
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
    { name: '@options', type: 'array', default: '', description: 'Preloaded records, filtered locally. Omit for remote mode, where records come from @onSearch.' },
    { name: '@labelKey', type: 'string', default: '"name"', description: 'Record property used as the label; id is the value.' },
    { name: '@filter', type: '(options, term) => array', default: '', description: 'Custom local match, forwarded to Woven::Dropdown.' },
    { name: '@value', type: 'any', default: '', description: 'Selected record id.' },
    { name: '@selectedName', type: 'string', default: '', description: 'Label of the selected record, shown in the input. Forwarded as @selectedLabel.' },
    { name: '@minChars', type: 'number', default: '2', description: 'Characters required before a remote search or a create row.' },
    { name: '@searchDebounce', type: 'number', default: '250', description: 'Forwarded to Woven::Dropdown.' },
    { name: '@searchOnOpen', type: 'boolean', default: 'false', description: 'Remote mode: search with an empty term when the list opens.' },
    { name: '@placeholder', type: 'string', default: '', description: 'Input placeholder.' },
    { name: '@promptText', type: 'string', default: '"Type to search"', description: 'Forwarded to Woven::Dropdown.' },
    { name: '@emptyText', type: 'string', default: '"No results found"', description: 'Forwarded to Woven::Dropdown.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Forwarded to Woven::Dropdown: kit sm or lg on the input.' },
    { name: '@disabled', type: 'boolean', default: 'false', description: 'Forwarded to Woven::Dropdown.' },
    { name: '@status', type: '"error" | "warning" | "success"', default: '', description: 'Forwarded to Woven::Dropdown; @invalid and @valid alias it.' },
  ];

  autocompleteCallbackRows = [
    { name: '@onSearch', signature: '(term) => Promise<array>', description: 'Remote mode: resolve the matching records. The host owns transport.' },
    { name: '@onCreate', signature: '(term) => Promise<record>', description: 'Passing it enables the create row. Resolve the new record to select it, or null to close without selecting.' },
    { name: '@onSelect', signature: '(record)', description: 'The chosen or created record.' },
    { name: '@onClear', signature: '()', description: 'Selection erased by clearing or emptying the input.' },
  ];
}

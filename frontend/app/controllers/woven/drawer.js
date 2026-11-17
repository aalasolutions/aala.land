import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const SIZE_NOTES = {
  sm: 'Kit sm (18rem). A narrow panel for short forms.',
  md: 'No modifier: the kit default width (24rem), for filter panels.',
  lg: 'Kit lg (32rem). Edit forms and previews; the default when no size is given.',
};

export default class WovenDrawerController extends Controller {
  @tracked drawerOpen = false;
  @tracked drawerPlacement = 'end';
  @tracked drawerSize = 'md';
  @tracked closedCount = 0;
  @tracked drawerArea = undefined;
  @tracked lockedOpen = false;
  @tracked noEscOpen = false;
  @tracked headerOpen = false;

  areaOptions = [
    { value: 'dubai-marina', label: 'Dubai Marina', group: 'Dubai' },
    { value: 'downtown', label: 'Downtown Dubai', group: 'Dubai' },
    { value: 'jbr', label: 'JBR', group: 'Dubai' },
    { value: 'yas', label: 'Yas Island', group: 'Abu Dhabi' },
    { value: 'reem', label: 'Al Reem Island', group: 'Abu Dhabi' },
  ];

  sizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size,
    title: `size ${size}`,
    note: SIZE_NOTES[size],
    code: `<Woven::Drawer @open={{this.open}} @title="Unit filters" @placement="end" @size="${size}" @onClose={{this.close}}>...</Woven::Drawer>`,
  }));

  @action
  openDrawer(placement, size) {
    this.drawerPlacement = placement;
    this.drawerSize = size;
    this.drawerOpen = true;
  }

  @action
  closeDrawer() {
    this.drawerOpen = false;
  }

  // Fires after the leave transition; the place to reset form state.
  @action
  afterClosed() {
    this.closedCount += 1;
    this.drawerArea = undefined;
  }

  @action
  pickArea(value) {
    this.drawerArea = value;
  }

  @action
  setOpen(key, value) {
    this[key] = value;
  }

  code = {
    placementEnd: `<Woven::Drawer @open={{this.open}} @title="Unit filters" @placement="end" @onClose={{this.close}}>...</Woven::Drawer>`,
    placementStart: `<Woven::Drawer @open={{this.open}} @title="Unit filters" @placement="start" @onClose={{this.close}}>...</Woven::Drawer>`,
    placementBottom: `<Woven::Drawer @open={{this.open}} @title="Unit filters" @placement="bottom" @onClose={{this.close}}>...</Woven::Drawer>`,
    basic: `<Woven::Button @text="Open drawer" @onClick={{this.open}} />

<Woven::Drawer
  @open={{this.drawerOpen}}
  @title="Unit filters"
  @placement="end"
  @size="md"
  @onClose={{this.close}}
  @onClosed={{this.afterClosed}}
>
  <:body>
    <Woven::Field @label="Area">
      <Woven::Dropdown @options={{this.areaOptions}} @value={{this.drawerArea}} @onSelect={{this.pickArea}} @align="start" />
    </Woven::Field>
  </:body>
  <:footer>
    <Woven::Button @text="Close" @onClick={{this.close}} />
  </:footer>
</Woven::Drawer>`,
    noBackdrop: `<Woven::Drawer @open={{this.open}} @title="Backdrop click ignored" @closeOnBackdrop={{false}} @onClose={{this.close}}>...</Woven::Drawer>`,
    noEsc: `<Woven::Drawer @open={{this.open}} @title="Escape ignored" @closeOnEsc={{false}} @onClose={{this.close}}>...</Woven::Drawer>`,
    header: `<Woven::Drawer @open={{this.open}} @onClose={{this.close}}>
  <:header as |titleId|>
    <h2 id={{titleId}} class="wu-drawer-title">Custom header</h2>
    <Woven::Tag @variant="info" @text="3 filters" />
  </:header>
  <:body>...</:body>
</Woven::Drawer>`,
  };

  argRows = [
    { name: '@open', type: 'boolean', default: 'false', description: 'Open flag. The drawer stays mounted through its leave transition after this turns false.' },
    { name: '@title', type: 'string', default: '', description: 'Header title (h2) and the dialog\'s accessible name; renders the close button.' },
    { name: '@placement', type: '"start" | "end" | "bottom" | "top"', default: '"end"', description: 'Edge the drawer docks to: start adds kit inline-start, bottom adds kit bottom, top renders bottom. Logical: start is the right edge under dir="rtl".' },
    { name: '@size', type: '"sm" | "md" | "lg"', default: '"lg"', description: 'Side drawer width: kit sm (18rem), no modifier (24rem) or kit lg (32rem). Omitted or unknown renders lg.' },
    { name: '@animated', type: 'boolean', default: 'true', description: 'Kit animated modifier: slide in and out when the user allows motion. Set false to open without motion.' },
    { name: '@closeOnBackdrop', type: 'boolean', default: 'true', description: 'Set false to ignore clicks outside the drawer.' },
    { name: '@closeOnEsc', type: 'boolean', default: 'true', description: 'Set false to ignore Escape.' },
  ];

  callbackRows = [
    { name: '@onClose', signature: '()', description: 'Close requested by the close button, the backdrop or Escape. The caller sets @open to false.' },
    { name: '@onClosed', signature: '()', description: 'After the leave transition has finished, or on teardown while still mounted. Reset form state here so it does not flash during the slide out.' },
  ];

  blockRows = [
    { name: 'header', description: 'Content of the kit wu-drawer-header; replaces the title and close button. Yields the title id for aria-labelledby.' },
    { name: 'body', description: 'Body content. Takes precedence over the default block.' },
    { name: 'default', description: 'Body content when no named body block is given.' },
    { name: 'footer', description: 'Action row in the kit wu-drawer-footer, aligned to the inline end.' },
  ];
}

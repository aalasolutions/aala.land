import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const SIZE_NOTES = {
  sm: 'A narrow panel for filters and short forms.',
  md: 'The usual edit form.',
  lg: 'Wide forms and previews.',
};

export default class NuvoDrawerController extends Controller {
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
    code: `<Nuvo::Drawer @open={{this.open}} @title="Unit filters" @placement="end" @size="${size}" @onClose={{this.close}}>...</Nuvo::Drawer>`,
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
    placementEnd: `<Nuvo::Drawer @open={{this.open}} @title="Unit filters" @placement="end" @onClose={{this.close}}>...</Nuvo::Drawer>`,
    placementStart: `<Nuvo::Drawer @open={{this.open}} @title="Unit filters" @placement="start" @onClose={{this.close}}>...</Nuvo::Drawer>`,
    placementTop: `<Nuvo::Drawer @open={{this.open}} @title="Unit filters" @placement="top" @onClose={{this.close}}>...</Nuvo::Drawer>`,
    placementBottom: `<Nuvo::Drawer @open={{this.open}} @title="Unit filters" @placement="bottom" @onClose={{this.close}}>...</Nuvo::Drawer>`,
    basic: `<Nuvo::Button @text="Open drawer" @onClick={{this.open}} />

<Nuvo::Drawer
  @open={{this.drawerOpen}}
  @title="Unit filters"
  @placement="end"
  @size="md"
  @onClose={{this.close}}
  @onClosed={{this.afterClosed}}
>
  <:body>
    <Nuvo::Field @label="Area">
      <Nuvo::Dropdown @options={{this.areaOptions}} @value={{this.drawerArea}} @onSelect={{this.pickArea}} @align="start" />
    </Nuvo::Field>
  </:body>
  <:footer>
    <Nuvo::Button @text="Close" @variant="secondary" @onClick={{this.close}} />
  </:footer>
</Nuvo::Drawer>`,
    noBackdrop: `<Nuvo::Drawer @open={{this.open}} @title="Backdrop click ignored" @closeOnBackdrop={{false}} @onClose={{this.close}}>...</Nuvo::Drawer>`,
    noEsc: `<Nuvo::Drawer @open={{this.open}} @title="Escape ignored" @closeOnEsc={{false}} @onClose={{this.close}}>...</Nuvo::Drawer>`,
    header: `<Nuvo::Drawer @open={{this.open}} @onClose={{this.close}}>
  <:header as |titleId|>
    <h2 id={{titleId}} class="nu-drawer__title">Custom header</h2>
    <Nuvo::Badge @variant="info" @text="3 filters" />
  </:header>
  <:body>...</:body>
</Nuvo::Drawer>`,
  };

  argRows = [
    { name: '@open', type: 'boolean', default: 'false', description: 'Open flag. The drawer stays mounted through its leave transition after this turns false.' },
    { name: '@title', type: 'string', default: '', description: 'Header title (h2) and the dialog\'s accessible name; renders the close button.' },
    { name: '@placement', type: '"start" | "end" | "top" | "bottom"', default: '', description: 'Edge the drawer slides from. Logical: start is the right edge under dir="rtl".' },
    { name: '@size', type: '"sm" | "md" | "lg"', default: '', description: 'Panel width (start/end) or height (top/bottom).' },
    { name: '@closeOnBackdrop', type: 'boolean', default: 'true', description: 'Set false to ignore clicks on the backdrop.' },
    { name: '@closeOnEsc', type: 'boolean', default: 'true', description: 'Set false to ignore Escape.' },
  ];

  callbackRows = [
    { name: '@onClose', signature: '()', description: 'Close requested by the close button, the backdrop or Escape. The caller sets @open to false.' },
    { name: '@onClosed', signature: '()', description: 'After the leave transition has finished, or on teardown while still mounted. Reset form state here so it does not flash during the slide out.' },
  ];

  blockRows = [
    { name: 'header', description: 'Replaces the title header. Yields the title id for aria-labelledby.' },
    { name: 'body', description: 'Body content. Takes precedence over the default block.' },
    { name: 'default', description: 'Body content when no named body block is given.' },
    { name: 'footer', description: 'Action row.' },
  ];
}

import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { VARIANTS } from '@wovenui/ember/components/woven/-constants';

const SIZE_NOTES = {
  sm: 'Confirmations and one-field prompts.',
  md: 'Short forms with a handful of fields; the default width.',
  lg: 'Longer forms and previews.',
  xl: 'Two-column layouts and tables inside a dialog.',
  full: 'Covers the viewport, for an editor or a wizard that needs the whole screen.',
};

export default class WovenModalController extends Controller {
  @tracked modalOpen = false;
  @tracked modalFullOpen = false;
  @tracked scrollableOpen = false;
  @tracked blurOpen = false;
  @tracked topOpen = false;
  @tracked noCloseOpen = false;
  @tracked noBackdropOpen = false;
  @tracked noEscOpen = false;
  @tracked headerOpen = false;
  @tracked sizedModal = null;

  fillerRows = VARIANTS;

  sizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size,
    title: `size ${size}`,
    note: SIZE_NOTES[size],
    code: `<Woven::Modal @open={{this.open}} @title="Size: ${size}" @size="${size}" @onClose={{this.close}}>...</Woven::Modal>`,
  }));

  @action
  openModal() {
    this.modalOpen = true;
  }

  @action
  closeModal() {
    this.modalOpen = false;
  }

  @action
  setOpen(key, value) {
    this[key] = value;
  }

  @action
  openSizedModal(size) {
    this.sizedModal = size;
  }

  @action
  closeSizedModal() {
    this.sizedModal = null;
  }

  code = {
    basic: `<Woven::Button @text="Open modal" @onClick={{this.openModal}} />

<Woven::Modal
  @open={{this.modalOpen}}
  @title="Cancel lease?"
  @subtitle="Unit 1204, Marina Tower"
  @size="md"
  @onClose={{this.closeModal}}
>
  <:body>
    <Woven::Text @text="This will end the lease for Ahmed Khalid effective today." />
  </:body>
  <:footer>
    <Woven::Button @text="Keep lease" @variant="secondary" @onClick={{this.closeModal}} />
    <Woven::Button @text="Cancel lease" @variant="danger" @onClick={{this.closeModal}} />
  </:footer>
</Woven::Modal>`,
    full: `<Woven::Modal @open={{this.modalFullOpen}} @title="Unit 1204 - full detail" @size="full" @scrollable={{true}} @onClose={{this.close}}>
  <Woven::Text @text="Full-screen modal body, scrollable when content overflows." />
</Woven::Modal>`,
    scrollable: `<Woven::Modal @open={{this.open}} @title="Scrollable body" @size="sm" @scrollable={{true}} @onClose={{this.close}}>
  <:body>...many rows...</:body>
  <:footer><Woven::Button @text="Close" @variant="secondary" @onClick={{this.close}} /></:footer>
</Woven::Modal>`,
    blur: `<Woven::Modal @open={{this.open}} @title="Blurred backdrop" @blur={{true}} @onClose={{this.close}}>...</Woven::Modal>`,
    top: `<Woven::Modal @open={{this.open}} @title="Top aligned" @top={{true}} @onClose={{this.close}}>...</Woven::Modal>`,
    noClose: `<Woven::Modal @open={{this.open}} @title="No close button" @showClose={{false}} @onClose={{this.close}}>
  <:footer><Woven::Button @text="Done" @onClick={{this.close}} /></:footer>
</Woven::Modal>`,
    noBackdrop: `<Woven::Modal @open={{this.open}} @title="Backdrop click ignored" @closeOnBackdrop={{false}} @onClose={{this.close}}>...</Woven::Modal>`,
    noEsc: `<Woven::Modal @open={{this.open}} @title="Escape ignored" @closeOnEsc={{false}} @onClose={{this.close}}>...</Woven::Modal>`,
    header: `<Woven::Modal @open={{this.open}} @onClose={{this.close}}>
  <:header as |titleId|>
    <div>
      <h2 id={{titleId}} class="wu-modal__title">Custom header</h2>
      <Woven::Badge @variant="warning" @text="Draft" />
    </div>
  </:header>
  <:body>...</:body>
</Woven::Modal>`,
  };

  argRows = [
    { name: '@open', type: 'boolean', default: 'false', description: 'Renders the backdrop and dialog while true; nothing is in the DOM while false.' },
    { name: '@title', type: 'string', default: '', description: 'Header title (h2) and the dialog\'s accessible name.' },
    { name: '@subtitle', type: 'string', default: '', description: 'Line under the title.' },
    { name: '@size', type: '"sm" | "md" | "lg" | "xl" | "full"', default: '', description: 'Panel width; full covers the viewport.' },
    { name: '@scrollable', type: 'boolean', default: 'false', description: 'Body scrolls while header and footer stay pinned.' },
    { name: '@blur', type: 'boolean', default: 'false', description: 'Backdrop blur.' },
    { name: '@top', type: 'boolean', default: 'false', description: 'Aligns the panel to the top of the viewport instead of centring it.' },
    { name: '@showClose', type: 'boolean', default: 'true', description: 'Set false to hide the header close button.' },
    { name: '@closeOnBackdrop', type: 'boolean', default: 'true', description: 'Set false to ignore clicks on the backdrop.' },
    { name: '@closeOnEsc', type: 'boolean', default: 'true', description: 'Set false to ignore Escape.' },
  ];

  callbackRows = [
    { name: '@onClose', signature: '()', description: 'Close requested by the close button, the backdrop or Escape. The caller sets @open to false.' },
  ];

  blockRows = [
    { name: 'header', description: 'Replaces the title header. Yields the title id to put on your heading for aria-labelledby.' },
    { name: 'body', description: 'Body content. Takes precedence over the default block.' },
    { name: 'default', description: 'Body content when no named body block is given.' },
    { name: 'footer', description: 'Action row.' },
  ];
}

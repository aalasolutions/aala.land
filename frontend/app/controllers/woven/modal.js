import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { VARIANTS } from '@wovenui/ember/components/woven/-constants';

const SIZE_NOTES = {
  sm: 'Kit sm. Confirmations and one-field prompts.',
  md: 'No modifier: the kit default width, for short forms with a handful of fields.',
  lg: 'Kit lg. Longer forms, previews and two-column layouts. xl renders the same.',
  full: 'Kit full: fills the viewport with no radius; the body scrolls. Media viewers.',
};

export default class WovenModalController extends Controller {
  @tracked modalOpen = false;
  @tracked scrollableOpen = false;
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
    <Woven::Button @text="Keep lease" @onClick={{this.closeModal}} />
    <Woven::Button @text="Cancel lease" @variant="danger" @onClick={{this.closeModal}} />
  </:footer>
</Woven::Modal>`,
    scrollable: `<Woven::Modal @open={{this.open}} @title="Scrollable body" @size="sm" @onClose={{this.close}}>
  <:body>...many rows...</:body>
  <:footer><Woven::Button @text="Close" @onClick={{this.close}} /></:footer>
</Woven::Modal>`,
    noClose: `<Woven::Modal @open={{this.open}} @title="No close button" @showClose={{false}} @onClose={{this.close}}>
  <:footer><Woven::Button @text="Done" @onClick={{this.close}} /></:footer>
</Woven::Modal>`,
    noBackdrop: `<Woven::Modal @open={{this.open}} @title="Backdrop click ignored" @closeOnBackdrop={{false}} @onClose={{this.close}}>...</Woven::Modal>`,
    noEsc: `<Woven::Modal @open={{this.open}} @title="Escape ignored" @closeOnEsc={{false}} @onClose={{this.close}}>...</Woven::Modal>`,
    header: `<Woven::Modal @open={{this.open}} @onClose={{this.close}}>
  <:header as |titleId|>
    <h2 id={{titleId}} class="wu-modal-title">Custom header</h2>
    <Woven::Tag @variant="warning" @text="Draft" />
  </:header>
  <:body>...</:body>
</Woven::Modal>`,
  };

  argRows = [
    { name: '@open', type: 'boolean', default: 'false', description: 'Renders the dialog and opens it with showModal() while true; nothing is in the DOM while false.' },
    { name: '@title', type: 'string', default: '', description: 'Header title (h2) and the dialog\'s accessible name.' },
    { name: '@subtitle', type: 'string', default: '', description: 'Line under the title.' },
    { name: '@size', type: '"sm" | "md" | "lg" | "xl" | "full"', default: '"md"', description: 'Kit sm, default (md) or lg width, or kit full to fill the viewport. xl renders lg.' },
    { name: '@animated', type: 'boolean', default: 'true', description: 'Kit animated modifier: fade and scale in when the user allows motion. Set false to open without motion.' },
    { name: '@showClose', type: 'boolean', default: 'true', description: 'Set false to hide the header close button.' },
    { name: '@closeOnBackdrop', type: 'boolean', default: 'true', description: 'Set false to ignore clicks outside the dialog.' },
    { name: '@closeOnEsc', type: 'boolean', default: 'true', description: 'Set false to ignore Escape.' },
  ];

  callbackRows = [
    { name: '@onClose', signature: '()', description: 'Close requested by the close button, the backdrop or Escape. The caller sets @open to false.' },
  ];

  blockRows = [
    { name: 'header', description: 'Content of the kit wu-modal-header; replaces the title, subtitle and close button. Yields the title id to put on your heading for aria-labelledby.' },
    { name: 'body', description: 'Body content. Takes precedence over the default block.' },
    { name: 'default', description: 'Body content when no named body block is given.' },
    { name: 'footer', description: 'Action row in the kit wu-modal-footer.' },
  ];
}

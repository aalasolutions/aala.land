import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

// Tests and pages without Woven::LayerHost fall back to a div on body.
let fallback = null;

function fallbackElement() {
  if (!fallback) {
    fallback = document.createElement('div');
    fallback.className = 'wu-layer';
    document.body.append(fallback);
  }
  return fallback;
}

// Hosts for anchored kit elements (menus, popovers, tooltips), so they escape
// overflow clipping. A modal dialog makes everything outside it inert, so an
// overlay whose trigger sits in an open dialog renders into that dialog's layer.
export default class LayerService extends Service {
  @tracked host = null;

  // Weak keys, so a dialog removed without unregistering is not kept alive.
  dialogLayers = new WeakMap();

  register(element) {
    this.host = element;
  }

  unregister(element) {
    if (this.host === element) {
      this.host = null;
    }
  }

  // Called by Woven::Modal, Woven::ConfirmModal and Woven::Drawer for their own layer.
  registerDialogLayer(dialog, element) {
    this.dialogLayers.set(dialog, element);
  }

  unregisterDialogLayer(dialog) {
    this.dialogLayers.delete(dialog);
  }

  // The body-level layer.
  get element() {
    return this.host ?? fallbackElement();
  }

  elementFor(trigger) {
    const dialog = trigger?.closest?.('dialog[open]');
    const layer = dialog ? this.dialogLayers.get(dialog) : null;
    return layer?.isConnected ? layer : this.element;
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.dialogLayers = new WeakMap();
    fallback?.remove();
    fallback = null;
  }
}

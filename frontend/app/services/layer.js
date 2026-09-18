import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

// Tests and pages without Nuvo::LayerHost fall back to a div on body.
let fallback = null;

function fallbackElement() {
  if (!fallback) {
    fallback = document.createElement('div');
    fallback.className = 'nu-layer';
    document.body.append(fallback);
  }
  return fallback;
}

// Body-level host for anchored kit elements (dropdown menus, popovers), so
// they escape overflow clipping and transformed ancestors.
export default class LayerService extends Service {
  @tracked host = null;

  register(element) {
    this.host = element;
  }

  unregister(element) {
    if (this.host === element) {
      this.host = null;
    }
  }

  get element() {
    return this.host ?? fallbackElement();
  }

  willDestroy() {
    super.willDestroy(...arguments);
    fallback?.remove();
    fallback = null;
  }
}

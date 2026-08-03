import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

const SETTINGS = {
  sidebarCollapsed: { key: 'sidebar-collapsed', default: false },
};

export default class UiSettingsService extends Service {
  @service preferences;

  @tracked sidebarCollapsed = SETTINGS.sidebarCollapsed.default;

  #loaded = false;

  get isLoaded() {
    return this.#loaded;
  }

  load() {
    for (const [name, spec] of Object.entries(SETTINGS)) {
      const stored = this.preferences.get(spec.key, spec.default);
      this[name] = typeof stored === typeof spec.default ? stored : spec.default;
    }
    this.#loaded = true;
  }

  // Named `update` because `set` is already an EmberObject method.
  update(name, value) {
    const spec = SETTINGS[name];
    if (!spec) {
      return;
    }
    this[name] = value;
    this.preferences.set(spec.key, value);
  }

  reset() {
    for (const [name, spec] of Object.entries(SETTINGS)) {
      this[name] = spec.default;
      this.preferences.remove(spec.key);
    }
    this.#loaded = false;
  }
}

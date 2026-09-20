import Service from '@ember/service';

// Browser-local store for kit UI state such as table layouts. The host app sets
// `keyPrefix` to scope keys per user; left unset, keys are global to the browser.
export default class NuvoStorageService extends Service {
  keyPrefix = 'nuvo-';

  _key(key) {
    return `${this.keyPrefix}${key}`;
  }

  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(this._key(key));
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  set(key, value) {
    try {
      localStorage.setItem(this._key(key), JSON.stringify(value));
    } catch {
      // storage full or unavailable
    }
  }

  remove(key) {
    try {
      localStorage.removeItem(this._key(key));
    } catch {
      // storage unavailable
    }
  }
}

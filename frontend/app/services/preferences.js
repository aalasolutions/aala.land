import Service, { service } from '@ember/service';

const PREFIX = 'aala-pref-';

export default class PreferencesService extends Service {
  @service auth;

  _key(key) {
    const userId = this.auth.currentUser?.id;
    return userId ? `${PREFIX}${userId}-${key}` : `${PREFIX}${key}`;
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
    localStorage.removeItem(this._key(key));
  }
}

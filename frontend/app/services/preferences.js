import Service from '@ember/service';

const PREFIX = 'aala-pref-';

export default class PreferencesService extends Service {
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(`${PREFIX}${key}`);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  set(key, value) {
    try {
      localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
    } catch {
      // storage full or unavailable
    }
  }

  remove(key) {
    localStorage.removeItem(`${PREFIX}${key}`);
  }
}

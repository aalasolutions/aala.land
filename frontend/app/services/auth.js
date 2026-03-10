import Service, { service } from '@ember/service';
import config from 'frontend/config/environment';

export default class AuthService extends Service {
  @service session;
  @service router;

  get apiBase() {
    return config.APP.API_BASE;
  }

  get isAuthenticated() {
    return this.session.isAuthenticated;
  }

  get currentUser() {
    return this.session.data?.authenticated?.user ?? null;
  }

  get token() {
    return this.session.data?.authenticated?.accessToken ?? null;
  }

  get refreshToken() {
    return this.session.data?.authenticated?.refreshToken ?? null;
  }

  async login(email, password) {
    await this.session.authenticate('authenticator:credentials', email, password);
  }

  async logout() {
    await this.session.invalidate();
  }

  async refresh() {
    const token = this.refreshToken;
    if (!token) {
      await this.logout();
      return;
    }

    try {
      const response = await fetch(`${this.apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });

      if (!response.ok) {
        await this.logout();
        return;
      }

      const { data } = await response.json();
      this.session.data.authenticated.accessToken = data.accessToken;
      this.session.data.authenticated.refreshToken = data.refreshToken;
    } catch {
      await this.logout();
    }
  }

  async authorizedFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (response.status === 401) {
      await this.logout();
      this.router.transitionTo('login');
      throw new Error('Unauthorized - redirected to login');
    }

    return response;
  }

  async fetchJson(path, options = {}) {
    const res = await this.authorizedFetch(`${this.apiBase}${path}`, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        Array.isArray(err.message)
          ? err.message.join(', ')
          : (err.message ?? 'Request failed'),
      );
    }
    return res.json();
  }
}

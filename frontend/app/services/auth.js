import Service, { service } from '@ember/service';
import config from 'frontend/config/environment';

async function parseErrorResponse(response, fallbackMessage) {
  const err = await response.json().catch(() => ({}));
  return Array.isArray(err.message)
    ? err.message.join(', ')
    : (err.message ?? fallbackMessage);
}

export default class AuthService extends Service {
  @service session;
  @service region;
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

  async register(registrationData) {
    const response = await fetch(`${this.apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationData),
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response, 'Registration failed'));
    }

    const { data } = await response.json();

    this.session.establish(data);

    return data;
  }

  async requestPasswordReset(email) {
    const response = await fetch(`${this.apiBase}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response, 'Unable to send reset link'));
    }

    const { data } = await response.json();
    return data;
  }

  async resetPassword(payload) {
    const response = await fetch(`${this.apiBase}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response, 'Unable to reset password'));
    }

    const { data } = await response.json();
    return data;
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        await this.logout();
        return;
      }

      const { data } = await response.json();
      if (!data?.accessToken) {
        await this.logout();
        return;
      }

      this.session.data.authenticated.accessToken = data.accessToken;
      this.session.saveToStorage();
    } catch {
      await this.logout();
    }
  }

  async authorizedFetch(url, options = {}) {
    const headers = {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${this.token}`,
    };
    // Only set Content-Type if body is not FormData (browser handles it for FormData)
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      await this.logout();
      this.router.transitionTo('login');
      throw new Error('Unauthorized - redirected to login');
    }

    return response;
  }

  async fetchJson(path, options = {}) {
    let finalPath = path;
    if (this.region.activeRegion && !path.startsWith('/auth/') && !path.includes('regionCode=')) {
      const separator = path.includes('?') ? '&' : '?';
      finalPath = `${path}${separator}regionCode=${this.region.regionCode}`;
    }

    const res = await this.authorizedFetch(`${this.apiBase}${finalPath}`, options);
    if (!res.ok) {
      throw new Error(await parseErrorResponse(res, 'Request failed'));
    }

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }

    return res.json();
  }
}

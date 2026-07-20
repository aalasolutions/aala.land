import Service, { service } from '@ember/service';
import config from 'land/config/environment';
import parseErrorResponse from 'land/utils/parse-error-response';

export default class AuthService extends Service {
  @service session;
  @service region;
  @service router;
  @service socket;
  @service notifications;

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

  get isImpersonating() {
    return this.session.isImpersonating;
  }

  async login(email, password) {
    await this.session.authenticate(
      'authenticator:credentials',
      email,
      password,
    );
  }

  async register(registrationData) {
    const response = await fetch(`${this.apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationData),
    });

    if (!response.ok) {
      throw new Error(
        await parseErrorResponse(response, 'Registration failed'),
      );
    }

    const { data } = await response.json();

    this.session.establish(data);

    return data;
  }

  async loginWithGoogle(idToken) {
    const data = await this.postAuthJson(
      '/auth/google',
      { idToken },
      'Google authentication failed',
    );
    this.session.establish(data);
    return data;
  }

  async signupWithGoogle(payload) {
    const data = await this.postAuthJson(
      '/auth/google/signup',
      payload,
      'Google signup failed',
    );
    this.session.establish(data);
    return data;
  }

  async linkGoogleAccount(idToken) {
    const response = await this.authorizedFetch(
      `${this.apiBase}/auth/google/link`,
      {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      },
    );

    if (!response.ok) {
      throw new Error(
        await parseErrorResponse(response, 'Unable to link Google account'),
      );
    }

    const { data } = await response.json();
    return data;
  }

  async requestPasswordReset(email) {
    const response = await fetch(`${this.apiBase}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(
        await parseErrorResponse(response, 'Unable to send reset link'),
      );
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
      throw new Error(
        await parseErrorResponse(response, 'Unable to reset password'),
      );
    }

    const { data } = await response.json();
    return data;
  }

  async postAuthJson(path, body, fallbackMessage) {
    const response = await fetch(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response, fallbackMessage));
    }

    const { data } = await response.json();
    return data;
  }

  async logout() {
    this.socket.disconnect();
    await this.session.invalidate();
  }

  async impersonate(userId) {
    const response = await this.authorizedFetch(
      `${this.apiBase}/auth/impersonate`,
      {
        method: 'POST',
        body: JSON.stringify({ userId }),
      },
    );

    if (!response.ok) {
      throw new Error(
        await parseErrorResponse(response, 'Impersonation failed'),
      );
    }

    const { data } = await response.json();
    this.session.impersonate(data);
    this.router.transitionTo('dashboard');
  }

  async exitImpersonation() {
    await this.session.exitImpersonation();
    this.router.transitionTo('team');
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

  /**
   * Re-reads the bootstrap bundle so session.lockState (and tier/regions)
   * reflect a lock applied or lifted while the tenant is logged in. Failures
   * keep the cached state; the next 423 retries.
   */
  async refreshLockState() {
    try {
      const res = await this.authorizedFetch(`${this.apiBase}/auth/profile`);
      if (!res.ok) return;
      const body = await res.json();
      if (body?.data) this.session.hydrate(body.data);
    } catch {
      // keep cached state
    }
  }

  async fetchJson(path, options = {}) {
    let finalPath = path;
    if (
      this.region.activeRegion &&
      !path.startsWith('/auth/') &&
      !path.includes('regionCode=')
    ) {
      const separator = path.includes('?') ? '&' : '?';
      finalPath = `${path}${separator}regionCode=${this.region.regionCode}`;
    }

    const res = await this.authorizedFetch(
      `${this.apiBase}${finalPath}`,
      options,
    );
    if (!res.ok) {
      const message = await parseErrorResponse(res, 'Request failed');
      if (res.status === 423) {
        // Write lock (COMPANY_LOCKED). Surface the reduce-or-pay message and
        // pull fresh lockState so the banner appears mid-session (design 8.2).
        this.notifications.error(message);
        void this.refreshLockState();
      }
      throw new Error(message);
    }

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }

    return res.json();
  }
}

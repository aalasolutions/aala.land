import Base from 'ember-simple-auth/authenticators/base';
import config from 'frontend/config/environment';

export default class CredentialsAuthenticator extends Base {
  async authenticate(email, password) {
    const response = await fetch(`${config.APP.API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error?.message ?? 'Login failed');
    }

    const { data } = await response.json();
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    };
  }

  async restore(data) {
    if (data?.accessToken) {
      return data;
    }
    throw new Error('Session expired');
  }

  async invalidate() {
    return;
  }
}

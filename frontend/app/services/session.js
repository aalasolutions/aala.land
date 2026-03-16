import Service from '@ember/service';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import config from 'frontend/config/environment';

export default class SessionService extends Service {
  @service router;
  @service region;

  @tracked isAuthenticated = false;
  @tracked data = {
    authenticated: {
      user: null,
      accessToken: null,
      refreshToken: null,
      regions: [],
      defaultRegionCode: 'dubai',
    },
  };

  constructor() {
    super(...arguments);
    this.restoreFromStorage();
  }

  restoreFromStorage() {
    const stored = localStorage.getItem('aala-session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        this.data = session.data;
        this.isAuthenticated = session.isAuthenticated;

        const authData = this.data.authenticated;
        if (authData.regions) {
          this.region.initialize(authData.regions, authData.defaultRegionCode || 'dubai');
        }
      } catch (error) {
        // If restore fails, clear corrupt data and start fresh
        localStorage.removeItem('aala-session');
        localStorage.removeItem('aala-region');
      }
    }
  }

  saveToStorage() {
    localStorage.setItem('aala-session', JSON.stringify({
      data: this.data,
      isAuthenticated: this.isAuthenticated,
    }));
  }

  async authenticate(method, email, password) {
    if (method === 'authenticator:credentials') {
      try {
        const response = await fetch(`${config.APP.API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          throw new Error('Login failed');
        }

        const { data } = await response.json();

        this.data.authenticated = {
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          regions: data.regions || [],
          defaultRegionCode: data.defaultRegionCode || 'dubai',
        };
        this.isAuthenticated = true;
        this.saveToStorage();

        this.region.initialize(
          data.regions || [],
          data.defaultRegionCode || 'dubai',
        );
      } catch (error) {
        this.isAuthenticated = false;
        throw error;
      }
    }
  }

  async invalidate() {
    // Call backend logout to invalidate refresh token and log audit event
    if (this.data.authenticated?.refreshToken) {
      try {
        await fetch(`${config.APP.API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.data.authenticated.accessToken}`,
          },
          body: JSON.stringify({ refreshToken: this.data.authenticated.refreshToken }),
        });
      } catch {
        // Ignore backend logout errors - proceed with local cleanup
      }
    }

    this.isAuthenticated = false;
    this.data = {
      authenticated: {
        user: null,
        accessToken: null,
        refreshToken: null,
        regions: [],
        defaultRegionCode: 'dubai',
      },
    };
    localStorage.removeItem('aala-session');
    this.region.clear();
  }

  requireAuthentication(transition, routeName) {
    if (!this.isAuthenticated) {
      this.router.transitionTo(routeName);
    }
  }
}

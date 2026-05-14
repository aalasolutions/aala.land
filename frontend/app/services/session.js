import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import config from 'frontend/config/environment';

export default class SessionService extends Service {
  @service router;
  @service region;

  @tracked isAuthenticated = false;
  @tracked isImpersonating = false;
  @tracked data = {
    authenticated: {
      user: null,
      accessToken: null,
      refreshToken: null,
      regions: [],
      defaultRegionCode: null,
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
        if (!session?.data?.authenticated) throw new Error('Invalid session structure');
        this.data = session.data;
        this.isAuthenticated = !!session.isAuthenticated;

        const authData = this.data.authenticated;
        if (authData.regions) {
          this.region.initialize(authData.regions, authData.defaultRegionCode || null);
        }
        this.isImpersonating = !!localStorage.getItem('aala-impersonator-session');
      } catch (error) {
        // If restore fails, clear corrupt data and start fresh
        localStorage.removeItem('aala-session');
        localStorage.removeItem('aala-region');
        localStorage.removeItem('aala-impersonator-session');
      }
    }
  }

  saveToStorage() {
    localStorage.setItem('aala-session', JSON.stringify({
      data: this.data,
      isAuthenticated: this.isAuthenticated,
    }));
  }

  establish(authData) {
    this.data = {
      authenticated: {
        user: authData.user,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
        regions: authData.regions || [],
        defaultRegionCode: authData.defaultRegionCode || null,
      },
    };
    this.isAuthenticated = true;
    this.saveToStorage();

    this.region.initialize(
      authData.regions || [],
      authData.defaultRegionCode || null,
    );
  }

  impersonate(authData) {
    const snapshot = JSON.stringify({
      data: this.data,
      isAuthenticated: this.isAuthenticated,
    });
    localStorage.setItem('aala-impersonator-session', snapshot);
    this.isImpersonating = true;
    this.establish(authData);
  }

  async exitImpersonation() {
    const saved = localStorage.getItem('aala-impersonator-session');
    if (!saved) {
      this.isImpersonating = false;
      localStorage.removeItem('aala-impersonator-session');
      return;
    }

    localStorage.removeItem('aala-impersonator-session');
    this.isImpersonating = false;

    try {
      const session = JSON.parse(saved);
      const authData = session?.data?.authenticated;
      if (!authData?.accessToken) throw new Error('Invalid session shape');
      this.establish(authData);
    } catch {
      await this.invalidate();
    }
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
        this.establish(data);
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
    this.isImpersonating = false;
    this.data = {
      authenticated: {
        user: null,
        accessToken: null,
        refreshToken: null,
        regions: [],
        defaultRegionCode: null,
      },
    };
    localStorage.removeItem('aala-session');
    localStorage.removeItem('aala-impersonator-session');
    this.region.clear();
  }

  requireAuthentication(transition, routeName) {
    if (!this.isAuthenticated) {
      this.router.transitionTo(routeName);
    }
  }
}

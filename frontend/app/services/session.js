import Service from '@ember/service';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

/**
 * Custom session service for managing authentication state.
 * Provides a compatible interface with the app's auth service and ember-simple-auth.
 */
export default class SessionService extends Service {
  @service router;

  @tracked isAuthenticated = false;
  @tracked data = {
    authenticated: {
      user: null,
      accessToken: null,
      refreshToken: null,
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
      } catch (error) {
        // If restore fails, just start fresh
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
    // Handle credentials authentication by calling API
    if (method === 'authenticator:credentials') {
      try {
        const response = await fetch('http://localhost:3010/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          throw new Error('Login failed');
        }

        const { data } = await response.json();

        // Set authenticated state with token and user data
        this.data.authenticated = {
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        };
        this.isAuthenticated = true;
        this.saveToStorage();
      } catch (error) {
        this.isAuthenticated = false;
        throw error;
      }
    }
  }

  async invalidate() {
    this.isAuthenticated = false;
    this.data = {
      authenticated: {
        user: null,
        accessToken: null,
        refreshToken: null,
      },
    };
    localStorage.removeItem('aala-session');
  }

  requireAuthentication(transition, routeName) {
    if (!this.isAuthenticated) {
      this.router.transitionTo(routeName);
    }
  }
}

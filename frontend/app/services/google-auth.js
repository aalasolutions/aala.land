import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import config from 'frontend/config/environment';

export default class GoogleAuthService extends Service {
  @tracked isInitialized = false;

  googleClientId = config.APP.GOOGLE_CLIENT_ID;

  get isConfigured() {
    return Boolean(this.googleClientId);
  }

  async initialize() {
    if (this.isInitialized) return Promise.resolve();

    if (!this.isConfigured) {
      throw new Error('Google Sign-In is not configured (missing GOOGLE_CLIENT_ID)');
    }

    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        this.isInitialized = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;

      script.onload = () => {
        this.isInitialized = true;
        resolve();
      };

      script.onerror = () => {
        reject(new Error('Failed to load Google Sign-In library'));
      };

      document.head.appendChild(script);
    });
  }

  async renderButton(element) {
    await this.initialize();

    return new Promise((resolve, reject) => {
      try {
        window.google.accounts.id.initialize({
          client_id: this.googleClientId,
          callback: (response) => {
            if (response.credential) {
              resolve(response.credential);
            } else {
              reject(new Error('No credential received from Google'));
            }
          },
        });

        window.google.accounts.id.renderButton(element, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: element.offsetWidth || 320,
        });
      } catch (error) {
        reject(error);
      }
    });
  }

}

import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import config from 'frontend/config/environment';

export default class GoogleAuthService extends Service {
  @tracked isInitialized = false;

  googleClientId = config.APP.GOOGLE_CLIENT_ID;
  googleScriptId = 'google-identity-services-script';
  initializationPromise = null;

  get isConfigured() {
    return Boolean(this.googleClientId);
  }

  async initialize() {
    if (this.isInitialized) return Promise.resolve();

    if (!this.isConfigured) {
      throw new Error('Google Sign-In is not configured (missing GOOGLE_CLIENT_ID)');
    }

    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        this.isInitialized = true;
        resolve();
        return;
      }

      let script = document.getElementById(this.googleScriptId);
      let shouldAppendScript = false;

      const handleLoad = () => {
        if (!window.google?.accounts?.id) {
          handleError();
          return;
        }

        this.isInitialized = true;
        resolve();
      };

      const handleError = () => {
        this.initializationPromise = null;
        script?.remove();
        reject(new Error('Failed to load Google Sign-In library'));
      };

      if (!script) {
        script = document.createElement('script');
        script.id = this.googleScriptId;
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        shouldAppendScript = true;
      }

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });

      if (shouldAppendScript) {
        document.head.appendChild(script);
      }
    });

    return this.initializationPromise;
  }

  async renderButton(element, onCredential) {
    await this.initialize();

    window.google.accounts.id.initialize({
      client_id: this.googleClientId,
      callback: (response) => {
        if (response.credential) {
          onCredential(response.credential);
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
  }

}

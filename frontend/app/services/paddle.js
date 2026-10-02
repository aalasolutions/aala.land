import Service from '@ember/service';
import config from 'land/config/environment';

export default class PaddleService extends Service {
  clientToken = config.APP.PADDLE_CLIENT_TOKEN;
  environment = config.APP.PADDLE_ENVIRONMENT;
  scriptId = 'paddle-js-script';
  loadPromise = null;
  isInitialized = false;
  // Paddle.Initialize runs once per page, so its callback forwards to the current listener.
  eventHandler = null;

  get isConfigured() {
    return Boolean(this.clientToken);
  }

  load() {
    if (window.Paddle) return Promise.resolve(window.Paddle);
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = this.scriptId;
      script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      script.async = true;
      script.addEventListener(
        'load',
        () => {
          if (window.Paddle) {
            resolve(window.Paddle);
          } else {
            this.loadPromise = null;
            script.remove();
            reject(new Error('Failed to load the checkout library'));
          }
        },
        { once: true },
      );
      script.addEventListener(
        'error',
        () => {
          this.loadPromise = null;
          script.remove();
          reject(new Error('Failed to load the checkout library'));
        },
        { once: true },
      );
      document.head.appendChild(script);
    });
    return this.loadPromise;
  }

  // Resolves true on the first Initialize, which also opens any `_ptxn` checkout in the URL.
  async setup(onEvent) {
    if (!this.isConfigured) {
      throw new Error(
        'Checkout is not configured (missing PADDLE_CLIENT_TOKEN)',
      );
    }
    const Paddle = await this.load();
    this.eventHandler = onEvent;
    if (this.isInitialized) return false;
    if (this.environment?.trim() !== 'production') {
      Paddle.Environment.set('sandbox');
    }
    Paddle.Initialize({
      token: this.clientToken,
      eventCallback: (event) => this.eventHandler?.(event),
    });
    this.isInitialized = true;
    return true;
  }

  open(transactionId) {
    window.Paddle.Checkout.open({ transactionId });
  }

  close() {
    window.Paddle?.Checkout?.close();
  }

  teardown() {
    this.eventHandler = null;
    if (this.isInitialized) this.close();
  }
}

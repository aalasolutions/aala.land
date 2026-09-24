// land/app/services/embedded-signup.js
import Service from '@ember/service';

const SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';
const SDK_ELEMENT_ID = 'facebook-jssdk';
const META_ORIGIN = 'https://www.facebook.com';

// Must be this exact value, not 'coexistence' (renamed); the old value fails silently.
const FEATURE_TYPE = 'whatsapp_business_app_onboarding';

// The agent is typing a code into a Meta-hosted flow, so this is generous on purpose.
const LAUNCH_TIMEOUT_MS = 10 * 60 * 1000;

// Meta's code expires in 30s; waiting longer for session info returns an expired credential.
const SESSION_INFO_TIMEOUT_MS = 20 * 1000;

// A script that neither loads nor errors must not wedge the button forever.
const SDK_LOAD_TIMEOUT_MS = 20 * 1000;

const FINISH_EVENTS = new Set([
  'FINISH',
  'FINISH_ONLY_WABA',
  'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
]);

class SignupCancelled extends Error {
  constructor(step) {
    super(
      step
        ? `Signup was cancelled at step "${step}"`
        : 'Signup was cancelled before it finished',
    );
    this.name = 'SignupCancelled';
    this.cancelled = true;
  }
}

// Resolves only when both the code and session info arrive; the backend requires both.
export default class EmbeddedSignupService extends Service {
  _sdkPromise = null;
  _initedAppId = null;

  loadSdk(appId, graphVersion) {
    if (this._initedAppId === appId && this._sdkPromise) return this._sdkPromise;

    this._sdkPromise = new Promise((resolve, reject) => {
      let timer = null;
      const settle = (fn, value) => {
        if (timer) clearTimeout(timer);
        fn(value);
      };

      const finishInit = () => {
        if (!window.FB?.init) {
          settle(reject, new Error('The Meta SDK loaded but is unavailable'));
          return;
        }
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: graphVersion,
        });
        this._initedAppId = appId;
        settle(resolve);
      };

      if (window.FB) {
        finishInit();
        return;
      }

      // Left from a failed attempt; an already-errored script never fires load again.
      document.getElementById(SDK_ELEMENT_ID)?.remove();

      const script = document.createElement('script');
      script.id = SDK_ELEMENT_ID;
      script.src = SDK_URL;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.addEventListener('load', finishInit, { once: true });
      script.addEventListener(
        'error',
        () => settle(reject, new Error('Could not load the Meta SDK')),
        { once: true },
      );
      timer = setTimeout(
        () => settle(reject, new Error('The Meta SDK took too long to load')),
        SDK_LOAD_TIMEOUT_MS,
      );
      document.body.appendChild(script);
    });

    // A failed load must not be cached as the answer forever.
    this._sdkPromise.catch(() => {
      this._sdkPromise = null;
    });
    return this._sdkPromise;
  }

  async launch({ appId, configId, graphVersion }) {
    await this.loadSdk(appId, graphVersion);

    return new Promise((resolve, reject) => {
      let sessionInfo = null;
      let code = null;
      let settled = false;
      let timer = null;

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        if (timer) clearTimeout(timer);
      };

      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };

      const maybeResolve = () => {
        if (!code || !sessionInfo) return;
        settle(resolve, {
          code,
          wabaId: sessionInfo.wabaId,
          phoneNumberId: sessionInfo.phoneNumberId,
        });
      };

      // Required by Meta for Coexistence; only place waba_id/phone_number_id arrive.
      const onMessage = (event) => {
        if (event.origin !== META_ORIGIN) return;
        let payload;
        try {
          payload =
            typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        } catch {
          return;
        }
        if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;

        // Meta sends the event name top-level; only the ids and step details sit under data.
        const data = payload.data ?? {};
        if (FINISH_EVENTS.has(payload.event)) {
          if (!data.waba_id || !data.phone_number_id) {
            settle(
              reject,
              new Error('Meta finished the signup without a phone number'),
            );
            return;
          }
          sessionInfo = {
            wabaId: data.waba_id,
            phoneNumberId: data.phone_number_id,
          };
          maybeResolve();
          return;
        }
        if (payload.event === 'CANCEL') {
          settle(reject, new SignupCancelled(data.current_step));
          return;
        }
        if (payload.event === 'ERROR') {
          settle(
            reject,
            new Error(data.error_message ?? 'Meta reported a signup error'),
          );
        }
      };

      timer = setTimeout(
        () => settle(reject, new SignupCancelled(null)),
        LAUNCH_TIMEOUT_MS,
      );

      window.addEventListener('message', onMessage);

      window.FB.login(
        (response) => {
          const returned = response?.authResponse?.code;
          if (!returned) {
            settle(reject, new SignupCancelled(null));
            return;
          }
          code = returned;
          if (!sessionInfo && timer) {
            clearTimeout(timer);
            timer = setTimeout(
              () => settle(reject, new SignupCancelled(null)),
              SESSION_INFO_TIMEOUT_MS,
            );
          }
          maybeResolve();
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: FEATURE_TYPE,
            sessionInfoVersion: '3',
          },
        },
      );
    });
  }
}

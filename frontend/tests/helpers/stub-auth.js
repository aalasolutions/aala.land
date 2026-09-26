import Service from '@ember/service';

// Registers an auth service whose fetchJson answers from `respond` and records every call.
export function stubAuth(owner, { role = 'agent', respond = () => ({}) } = {}) {
  const calls = [];
  owner.register(
    'service:auth',
    class extends Service {
      currentUser = { id: 'user-1', role };

      async fetchJson(path, options = {}) {
        const body = options.body ? JSON.parse(options.body) : undefined;
        calls.push({ path, method: options.method ?? 'GET', body });
        const result = await respond(path, options);
        if (result instanceof Error) throw result;
        return result;
      }
    },
  );
  return calls;
}

// A fetchJson rejection shaped like services/auth.js throws for a non-2xx response.
export function httpError(status, body) {
  const error = new Error(body?.message ?? 'Request failed');
  error.status = status;
  error.body = body;
  return error;
}

// Records toasts instead of rendering them.
export function stubNotifications(owner) {
  const toasts = [];
  owner.register(
    'service:notifications',
    class extends Service {
      success(message) {
        toasts.push({ type: 'success', message });
      }
      info(message) {
        toasts.push({ type: 'info', message });
      }
      error(message) {
        toasts.push({ type: 'error', message });
      }
      warning(message) {
        toasts.push({ type: 'warning', message });
      }
    },
  );
  return toasts;
}

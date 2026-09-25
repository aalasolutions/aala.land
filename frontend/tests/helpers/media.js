// Loadable in-page sources, so no fixture ever hits the network or raises a real media error.
export const PNG_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Two seconds of 8 kHz mono silence.
export function wavUrl() {
  const samples = 16000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// Replaces play/pause on one element so tests never depend on autoplay policy.
export function stubPlayback(element) {
  let paused = true;
  Object.defineProperty(element, 'paused', {
    configurable: true,
    get: () => paused,
  });
  element.play = () => {
    if (paused) {
      paused = false;
      element.dispatchEvent(new Event('play'));
      element.dispatchEvent(new Event('playing'));
    }
    return Promise.resolve();
  };
  element.pause = () => {
    if (!paused) {
      paused = true;
      element.dispatchEvent(new Event('pause'));
    }
  };
  return element;
}

// Stand-in IntersectionObserver; `autoFire` reports every observed element as visible at once.
export function installFakeIntersectionObserver({ autoFire = true } = {}) {
  const original = window.IntersectionObserver;
  const instances = [];
  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = new Set();
      this.disconnected = false;
      instances.push(this);
    }
    observe(element) {
      this.targets.add(element);
      if (autoFire) this.fire(element);
    }
    unobserve(element) {
      this.targets.delete(element);
    }
    disconnect() {
      this.targets.clear();
      this.disconnected = true;
    }
    fire(element) {
      this.callback([{ target: element, isIntersecting: true }]);
    }
  }
  window.IntersectionObserver = FakeIntersectionObserver;
  return {
    instances,
    restore() {
      window.IntersectionObserver = original;
    },
  };
}

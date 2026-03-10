import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class NotificationsService extends Service {
  @tracked toasts = [];

  #nextId = 0;

  add(message, type = 'info', duration = 4000) {
    const id = ++this.#nextId;
    this.toasts = [...this.toasts, { id, message, type }];

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return id;
  }

  success(message, duration) {
    return this.add(message, 'success', duration);
  }

  error(message, duration) {
    return this.add(message, 'error', duration);
  }

  warning(message, duration) {
    return this.add(message, 'warning', duration);
  }

  remove(id) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  clear() {
    this.toasts = [];
  }
}

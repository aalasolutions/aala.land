import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class AdminSystemController extends Controller {
  @service auth;
  @service notifications;

  @tracked health = null;
  @tracked fixing = false;

  get data() {
    return this.health ?? this.model;
  }

  get rows() {
    return (this.data?.rows ?? []).map((row) => ({
      ...row,
      label: `${row.kind} / ${(row.currency || '').toUpperCase()}`,
    }));
  }

  get overallState() {
    const d = this.data;
    if (!d) return 'unknown';
    if (d.failed > 0) return 'failed';
    if (d.missing > 0) return 'missing';
    return 'ok';
  }

  get healthBadge() {
    switch (this.overallState) {
      case 'ok':
        return {
          cls: 'status-paid',
          text: `OK, ${this.data.registered} of ${this.data.total} active`,
        };
      case 'missing':
        return { cls: 'status-pending', text: `${this.data.missing} missing` };
      case 'failed':
        return { cls: 'status-failed', text: 'Sync failed' };
      default:
        return { cls: 'status-pending', text: 'Unknown' };
    }
  }

  get needsFix() {
    return this.overallState !== 'ok';
  }

  @action
  async fix() {
    if (this.fixing) return;
    this.fixing = true;
    try {
      await this.auth.fetchJson('/billing/prices/sync', { method: 'POST' });
      const res = await this.auth.fetchJson('/console/system/price-health');
      this.health = res?.data ?? this.health;
      this.notifications.success('Price sync run');
    } catch (e) {
      this.notifications.error(e.message || 'Sync failed');
    } finally {
      this.fixing = false;
    }
  }
}

import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class AuditController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked filterAction = '';
  @tracked filterEntityType = '';
  @tracked expandedLogId = null;
  @tracked showPurgeModal = false;
  @tracked purgeDays = 90;
  @tracked isPurging = false;

  @action setFilterAction(event) {
    const value = event.target.value;
    this.filterAction = value;
    this.router.transitionTo('audit', {
      queryParams: {
        action: value || undefined,
        page: 1,
      },
    });
  }

  @action setFilterEntityType(event) {
    const value = event.target.value;
    this.filterEntityType = value;
    this.router.transitionTo('audit', {
      queryParams: {
        entityType: value || undefined,
        page: 1,
      },
    });
  }

  @action clearFilters() {
    this.filterAction = '';
    this.filterEntityType = '';
    this.router.transitionTo('audit', {
      queryParams: {
        action: undefined,
        entityType: undefined,
        page: 1,
      },
    });
  }

  @action toggleExpand(logId) {
    this.expandedLogId = this.expandedLogId === logId ? null : logId;
  }

  @action formatJson(value) {
    if (!value) return '-';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  @action getActionBadgeClass(action) {
    const classes = {
      CREATE: 'bg-green-100 text-green-800',
      UPDATE: 'bg-blue-100 text-blue-800',
      DELETE: 'bg-red-100 text-red-800',
      ASSIGN: 'bg-purple-100 text-purple-800',
      LOGIN: 'bg-gray-100 text-gray-800',
      LOGOUT: 'bg-gray-100 text-gray-800',
      IMPORT: 'bg-yellow-100 text-yellow-800',
      EXPORT: 'bg-indigo-100 text-indigo-800',
    };
    return classes[action] || 'bg-gray-100 text-gray-800';
  }

  @action formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action openPurge() {
    this.purgeDays = 90;
    this.showPurgeModal = true;
  }

  @action closePurge() {
    this.showPurgeModal = false;
  }

  @action stopPropagation(event) {
    event.stopPropagation();
  }

  @action async confirmPurge() {
    if (this.isPurging) return;
    this.isPurging = true;

    try {
      const result = await this.auth.fetchJson(`/audit-logs/purge?olderThanDays=${this.purgeDays}`, {
        method: 'DELETE',
      });
      const deleted = result.data?.deleted || 0;
      this.notifications.success(`Purged ${deleted} audit log${deleted !== 1 ? 's' : ''}`);
      this.closePurge();
      this.router.refresh('audit');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isPurging = false;
    }
  }
}

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

  @action setFilterAction(value) {
    this.filterAction = value;
    this.router.transitionTo('audit', {
      queryParams: {
        action: value || undefined,
        page: 1,
      },
    });
  }

  @action setFilterEntityType(value) {
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

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

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
      const result = await this.auth.fetchJson(
        `/audit-logs/purge?olderThanDays=${this.purgeDays}`,
        {
          method: 'DELETE',
        },
      );
      const deleted = result.data?.deleted || 0;
      this.notifications.success(
        `Purged ${deleted} audit log${deleted !== 1 ? 's' : ''}`,
      );
      this.closePurge();
      this.router.refresh('audit');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isPurging = false;
    }
  }
}

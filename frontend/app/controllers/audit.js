import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class AuditController extends Controller {
  @service notifications;

  @tracked filterAction = '';
  @tracked filterEntityType = '';
  @tracked expandedLogId = null;

  @action setFilterAction(event) {
    const value = event.target.value;
    this.filterAction = value;
    this.transitionToRoute('audit', {
      queryParams: {
        action: value || undefined,
        page: 1,
      },
    });
  }

  @action setFilterEntityType(event) {
    const value = event.target.value;
    this.filterEntityType = value;
    this.transitionToRoute('audit', {
      queryParams: {
        entityType: value || undefined,
        page: 1,
      },
    });
  }

  @action clearFilters() {
    this.filterAction = '';
    this.filterEntityType = '';
    this.transitionToRoute('audit', {
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
}

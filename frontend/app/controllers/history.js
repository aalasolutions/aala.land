import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { HISTORY_ACTIONS, HISTORY_ENTITY_TYPES } from '../routes/history';

const ACTION_VARIANTS = {
  DELETE: 'danger',
  CANCEL: 'danger',
  BOUNCE: 'danger',
  TERMINATE: 'danger',
  DEACTIVATE: 'danger',
  ARCHIVE: 'warning',
  REPLACE: 'warning',
  UNARCHIVE: 'success',
  REACTIVATE: 'success',
  STATUS_CHANGE: 'info',
};

const labelFor = (options, value) =>
  options.find((o) => o.value === value)?.label ?? value;

export default class HistoryController extends PaginatedController {
  queryParams = [
    'page',
    'limit',
    { filterAction: 'action' },
    { filterEntityType: 'entityType' },
  ];

  @tracked filterAction = '';
  @tracked filterEntityType = '';

  actionOptions = HISTORY_ACTIONS;
  entityTypeOptions = HISTORY_ENTITY_TYPES;

  get rows() {
    return (this.model?.entries || []).map((entry) => ({
      ...entry,
      actionLabel: labelFor(HISTORY_ACTIONS, entry.action),
      actionVariant: ACTION_VARIANTS[entry.action] ?? 'secondary',
      entityTypeLabel: labelFor(HISTORY_ENTITY_TYPES, entry.entityType),
    }));
  }

  @action goToPage(page) {
    this.page = page;
  }

  @action setFilterAction(value) {
    this.filterAction = value || '';
    this.page = 1;
  }

  @action setFilterEntityType(value) {
    this.filterEntityType = value || '';
    this.page = 1;
  }

  @action clearFilters() {
    this.filterAction = '';
    this.filterEntityType = '';
    this.page = 1;
  }
}

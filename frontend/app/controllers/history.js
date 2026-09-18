import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import {
  HISTORY_ACTIONS,
  HISTORY_ENTITY_TYPES,
  HISTORY_ACTION_VARIANTS as ACTION_VARIANTS,
  optionLabelFor as labelFor,
} from 'land/constants';

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

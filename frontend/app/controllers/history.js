import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import CellText from '@wovenui/ember/components/woven/cell/text';
import CellDate from 'land/components/cell/date';
import CellStatus from 'land/components/cell/status';
import {
  HISTORY_ACTIONS,
  HISTORY_ENTITY_TYPES,
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

  columns = [
    {
      name: 'Date',
      valuePath: 'createdAt',
      width: 140,
      isFixed: 'left',
      cell: CellDate,
      cellArgs: { withTime: true, regionPath: 'regionCode' },
      stackedLabel: false,
    },
    {
      name: 'Action',
      valuePath: 'action',
      width: 160,
      cell: CellStatus,
      cellArgs: { domain: 'historyAction' },
    },
    {
      name: 'Type',
      valuePath: 'entityTypeLabel',
      width: 160,
      cell: CellText,
    },
    { name: 'Record', valuePath: 'entityTitle', width: 220, cell: CellText },
    {
      name: 'Context',
      valuePath: 'contextTitle',
      width: 200,
      cell: CellText,
    },
    { name: 'Reason', valuePath: 'reason', width: 220, cell: CellText },
    { name: 'By', valuePath: 'actorName', width: 180, cell: CellText },
  ];

  get hasActiveFilters() {
    return this.activeFilterCount > 0;
  }

  get activeFilterCount() {
    return [this.filterAction, this.filterEntityType].filter(Boolean).length;
  }

  get rows() {
    return (this.model?.entries || []).map((entry) => ({
      ...entry,
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

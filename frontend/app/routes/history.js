import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export const HISTORY_ACTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'DELETE', label: 'Deleted' },
  { value: 'ARCHIVE', label: 'Archived' },
  { value: 'UNARCHIVE', label: 'Unarchived' },
  { value: 'CANCEL', label: 'Cancelled' },
  { value: 'REPLACE', label: 'Replaced' },
  { value: 'BOUNCE', label: 'Bounced' },
  { value: 'STATUS_CHANGE', label: 'Status changed' },
  { value: 'TERMINATE', label: 'Terminated' },
  { value: 'DEACTIVATE', label: 'Deactivated' },
  { value: 'REACTIVATE', label: 'Reactivated' },
];

export const HISTORY_ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'Unit', label: 'Property' },
  { value: 'Asset', label: 'Asset' },
  { value: 'Lease', label: 'Lease' },
  { value: 'Contact', label: 'Contact' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'WorkOrder', label: 'Work Order' },
  { value: 'Commission', label: 'Commission' },
  { value: 'User', label: 'User' },
];

export default class HistoryRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    filterAction: { refreshModel: true },
    filterEntityType: { refreshModel: true },
  };

  async model(params) {
    const {
      page = 1,
      limit = 10,
      filterAction = '',
      filterEntityType = '',
    } = params;
    const queryParams = new URLSearchParams({ page, limit });
    if (filterAction) queryParams.set('action', filterAction);
    if (filterEntityType) queryParams.set('entityType', filterEntityType);

    try {
      const json = await this.auth.fetchJson(
        `/record-history?${queryParams.toString()}`,
      );
      return {
        entries: json?.data?.data || [],
        total: json?.data?.total || 0,
        page: json?.data?.page || 1,
      };
    } catch (e) {
      const forbidden = e?.status === 403;
      return {
        entries: [],
        total: 0,
        page: 1,
        forbidden,
        error: forbidden ? '' : e?.message || 'Failed to load history',
      };
    }
  }
}

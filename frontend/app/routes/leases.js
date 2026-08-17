import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class LeasesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    status: { refreshModel: true },
    type: { refreshModel: true },
    search: { refreshModel: true },
    dateFrom: { refreshModel: true },
    dateTo: { refreshModel: true },
  };

  async model({
    page = 1,
    limit = 10,
    status = '',
    type = '',
    search = '',
    dateFrom = '',
    dateTo = '',
  }) {
    const params = new URLSearchParams({ page, limit });
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (search) params.set('search', search);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const [leasesJson, unitsJson, contactsJson] = await Promise.all([
      safeJson(this.auth, `/leases?${params.toString()}`, 'LEASES'),
      safeJson(this.auth, '/properties/units?page=1&limit=100', 'LEASES'),
      safeJson(this.auth, '/contacts?page=1&limit=100', 'LEASES'),
    ]);

    return {
      leases: leasesJson?.data?.data ?? [],
      units: unitsJson?.data?.data ?? [],
      contacts: contactsJson?.data?.data ?? [],
      total: leasesJson?.data?.total ?? 0,
      page: leasesJson?.data?.page ?? page,
      limit: leasesJson?.data?.limit ?? limit,
    };
  }

  resetController(controller, isExiting) {
    if (isExiting) controller.resetState();
  }
}

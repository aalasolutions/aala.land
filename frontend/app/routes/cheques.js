import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class ChequesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [chequesJson, unitsJson, scheduleJson] = await Promise.all([
      safeJson(this.auth, `/cheques?page=${page}&limit=${limit}`, 'CHEQUES'),
      safeJson(this.auth, '/properties/units?page=1&limit=100', 'CHEQUES'),
      safeJson(this.auth, '/cheques/collection-schedule', 'CHEQUES'),
    ]);

    return {
      cheques: chequesJson?.data?.data ?? [],
      units: unitsJson?.data?.data ?? [],
      collectionSchedule: scheduleJson?.data ?? [],
      total: chequesJson?.data?.total ?? 0,
      page,
      limit,
    };
  }
}

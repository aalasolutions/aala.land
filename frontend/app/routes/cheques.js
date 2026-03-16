import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ChequesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const safeJson = async (path) => {
      try { return await this.auth.fetchJson(path); }
      catch (e) { console.error('[CHEQUES-ROUTE] Failed:', path, e.message); return null; }
    };

    const [chequesJson, unitsJson, scheduleJson] = await Promise.all([
      safeJson(`/cheques?page=${page}&limit=${limit}`),
      safeJson(`/properties/units?page=1&limit=100`),
      safeJson(`/cheques/collection-schedule`),
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

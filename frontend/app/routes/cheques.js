import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ChequesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    try {
      const [chequesJson, unitsJson, scheduleJson] = await Promise.all([
        this.auth.fetchJson(`/cheques?page=${page}&limit=${limit}`),
        this.auth.fetchJson(`/properties/units?page=1&limit=100`),
        this.auth.fetchJson(`/cheques/collection-schedule`),
      ]);

      return {
        cheques: chequesJson.data?.data ?? [],
        units: unitsJson.data?.data ?? [],
        collectionSchedule: scheduleJson.data ?? [],
        total: chequesJson.data?.total ?? 0,
        page,
        limit,
      };
    } catch {
      return { cheques: [], units: [], collectionSchedule: [], total: 0, page: 1, limit: 20 };
    }
  }
}

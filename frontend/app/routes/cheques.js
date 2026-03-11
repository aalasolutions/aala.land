import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ChequesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [chequesRes, unitsRes, scheduleRes] = await Promise.all([
      this.auth.authorizedFetch(`${this.auth.apiBase}/cheques?page=${page}&limit=${limit}`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/properties/units?page=1&limit=100`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/cheques/collection-schedule`),
    ]);
    if (!chequesRes.ok) return { cheques: [], units: [], collectionSchedule: [], total: 0, page: 1, limit: 20 };
    const chequesJson = await chequesRes.json();
    const units = unitsRes.ok ? (await unitsRes.json()).data?.data ?? [] : [];
    const collectionSchedule = scheduleRes.ok ? (await scheduleRes.json()).data ?? [] : [];
    return {
      cheques: chequesJson.data?.data ?? [],
      units,
      collectionSchedule,
      total: chequesJson.data?.total ?? 0,
      page,
      limit,
    };
  }
}

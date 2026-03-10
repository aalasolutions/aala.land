import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class ChequesRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [chequesRes, unitsRes] = await Promise.all([
      this.auth.authorizedFetch(`${this.auth.apiBase}/cheques?page=${page}&limit=${limit}`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/properties/units?page=1&limit=100`),
    ]);
    if (!chequesRes.ok) return { cheques: [], units: [], total: 0, page: 1, limit: 20 };
    const chequesJson = await chequesRes.json();
    const units = unitsRes.ok ? (await unitsRes.json()).data?.data ?? [] : [];
    return {
      cheques: chequesJson.data?.data ?? [],
      units,
      total: chequesJson.data?.total ?? 0,
      page,
      limit,
    };
  }
}

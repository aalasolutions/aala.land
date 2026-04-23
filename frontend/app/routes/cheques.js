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

    const schedule = scheduleJson?.data ?? {};
    const toGroup = (period, cheques) => ({
      period,
      cheques: cheques ?? [],
      totalAmount: (cheques ?? []).reduce((sum, c) => sum + Number(c.amount), 0),
    });
    const collectionSchedule = [
      toGroup('Overdue', schedule.overdue),
      toGroup('This Week', schedule.thisWeek),
      toGroup('Next Week', schedule.nextWeek),
      toGroup('This Month', schedule.thisMonth),
    ].filter(g => g.cheques.length > 0);

    return {
      cheques: chequesJson?.data?.data ?? [],
      units: unitsJson?.data?.data ?? [],
      collectionSchedule,
      total: chequesJson?.data?.total ?? 0,
      page,
      limit,
    };
  }
}

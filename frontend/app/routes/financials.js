import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { DEFAULT_RANGE, resolveRange } from 'land/utils/local-date';

export default class FinancialsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    activeTab: { refreshModel: true },
    range: { refreshModel: true },
    from: { refreshModel: true },
    to: { refreshModel: true },
  };

  async model({
    page = 1,
    limit = 50,
    activeTab = 'all',
    range = DEFAULT_RANGE,
    from,
    to,
  }) {
    const bounds = resolveRange(range, from, to);

    try {
      const params = new URLSearchParams({ page, limit, ...bounds });
      if (activeTab !== 'all') {
        params.set('type', activeTab);
      }

      const [txnJson, summaryJson, depositsJson, cashflowJson] =
        await Promise.all([
          this.auth.fetchJson(`/financial/transactions?${params}`),
          this.auth.fetchJson(
            `/financial/transactions/summary?${new URLSearchParams(bounds)}`,
          ),
          this.auth.fetchJson(`/financial/deposit-reminders`),
          this.auth.fetchJson(`/financial/cashflow-trend`),
        ]);

      const transactions = txnJson.data ?? { data: [], total: 0 };
      return {
        transactions: transactions.data ?? [],
        total: transactions.total ?? 0,
        summary: summaryJson.data ?? null,
        depositReminders: depositsJson.data ?? [],
        cashflow: cashflowJson.data ?? [],
        page,
        limit,
        activeTab,
        range,
        bounds,
      };
    } catch {
      return {
        transactions: [],
        total: 0,
        summary: null,
        depositReminders: [],
        cashflow: [],
        page,
        limit,
        activeTab,
        range,
        bounds,
      };
    }
  }
}

import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class FinancialsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    try {
      const [txnJson, summaryJson, depositsJson] = await Promise.all([
        this.auth.fetchJson(`/financial/transactions?page=${page}&limit=${limit}`),
        this.auth.fetchJson(`/financial/transactions/summary`),
        this.auth.fetchJson(`/financial/deposit-reminders`),
      ]);

      const transactions = txnJson.data ?? { data: [], total: 0 };
      return {
        transactions: transactions.data ?? [],
        total: transactions.total ?? 0,
        summary: summaryJson.data ?? null,
        depositReminders: depositsJson.data ?? [],
        page,
      };
    } catch {
      return { transactions: [], total: 0, summary: null, depositReminders: [], page };
    }
  }
}

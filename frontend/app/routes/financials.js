import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class FinancialsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [transactionsRes, summaryRes] = await Promise.all([
      this.auth.authorizedFetch(`${this.auth.apiBase}/financial/transactions?page=${page}&limit=${limit}`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/financial/transactions/summary`),
    ]);

    const transactions = transactionsRes.ok
      ? (await transactionsRes.json()).data
      : { data: [], total: 0 };
    const summary = summaryRes.ok ? (await summaryRes.json()).data : null;

    return { transactions: transactions.data ?? [], total: transactions.total ?? 0, summary, page };
  }
}

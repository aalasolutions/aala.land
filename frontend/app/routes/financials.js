import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class FinancialsRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
  };

  async model({ page = 1, limit = 20 }) {
    const [transactionsRes, summaryRes, depositsRes] = await Promise.all([
      this.auth.authorizedFetch(`${this.auth.apiBase}/financial/transactions?page=${page}&limit=${limit}`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/financial/transactions/summary`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/financial/deposit-reminders`),
    ]);

    const transactions = transactionsRes.ok
      ? (await transactionsRes.json()).data
      : { data: [], total: 0 };
    const summary = summaryRes.ok ? (await summaryRes.json()).data : null;
    const depositReminders = depositsRes.ok ? (await depositsRes.json()).data ?? [] : [];

    return { transactions: transactions.data ?? [], total: transactions.total ?? 0, summary, depositReminders, page };
  }
}

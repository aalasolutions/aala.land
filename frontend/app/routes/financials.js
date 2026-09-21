import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import {
  DEFAULT_RANGE,
  isKnownRange,
  resolveRange,
} from 'land/utils/local-date';

export default class FinancialsRoute extends AuthenticatedRoute {
  @service auth;
  @service notifications;
  @service region;
  @service router;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    activeTab: { refreshModel: true },
    range: { refreshModel: true },
    from: { refreshModel: true },
    to: { refreshModel: true },
  };

  // A range the page cannot offer is corrected in the URL, so URL/UI/query stay in sync.
  beforeModel(transition) {
    super.beforeModel(transition);
    // The auth guard owns the transition when it redirects, so it is not raced here.
    if (!this.session.isAuthenticated) return undefined;

    const requested = transition.to?.queryParams?.range;
    if (requested === undefined || isKnownRange(requested)) return undefined;

    this.notifications.warning(
      `"${requested}" is not a date range on this page. Showing the default instead.`,
    );
    return this.router.replaceWith('financials', {
      queryParams: { range: DEFAULT_RANGE, from: null, to: null },
    });
  }

  async model({
    page = 1,
    limit = 50,
    activeTab = 'all',
    range = DEFAULT_RANGE,
    from,
    to,
  }) {
    // The region's business day decides the bounds; the util falls back to browser-local.
    const bounds = resolveRange(
      range,
      from,
      to,
      new Date(),
      this.region.activeRegion?.timezone,
    );

    // A side panel must not blank the page, so its failure degrades to a toast.
    const optional = (path) =>
      this.auth.fetchJson(path).catch((e) => {
        this.notifications.error(e?.message || `Failed to load ${path}`);
        return null;
      });

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
          optional('/financial/deposit-reminders'),
          optional('/financial/cashflow-trend'),
        ]);

      const transactions = txnJson.data ?? { data: [], total: 0 };
      // The endpoint groups reminders into four exclusive buckets, ordered most urgent first.
      const deposits = depositsJson?.data ?? {};
      return {
        transactions: transactions.data ?? [],
        total: transactions.total ?? 0,
        summary: summaryJson.data ?? null,
        depositReminders: [
          ...(deposits.overdue ?? []),
          ...(deposits.dueToday ?? []),
          ...(deposits.dueThisWeek ?? []),
          ...(deposits.dueThisMonth ?? []),
        ],
        cashflow: cashflowJson?.data ?? [],
        page,
        limit,
        activeTab,
        range,
        bounds,
      };
    } catch (e) {
      const forbidden = e?.status === 403;
      const error = forbidden ? '' : e?.message || 'Failed to load financials';
      if (error) {
        this.notifications.error(error);
      }
      return {
        transactions: [],
        total: 0,
        summary: null,
        depositReminders: [],
        cashflow: [],
        forbidden,
        error,
        page,
        limit,
        activeTab,
        range,
        bounds,
      };
    }
  }
}

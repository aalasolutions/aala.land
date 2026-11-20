import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { contactsListFilters } from 'land/utils/contacts-query';

export default class ContactsIndexRoute extends AuthenticatedRoute {
  @service auth;
  @service region;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    search: { refreshModel: true },
    tag: { refreshModel: true },
    agentId: { refreshModel: true },
    isWhatsapp: { refreshModel: true },
    company: { refreshModel: true },
    companyExact: { refreshModel: true },
    region: { refreshModel: true },
    nationality: { refreshModel: true },
    dateFrom: { refreshModel: true },
    dateTo: { refreshModel: true },
    allRegions: { refreshModel: true },
  };

  async model(params) {
    const { page = 1, limit = 50 } = params;
    const query = new URLSearchParams({
      page,
      limit,
      tagCounts: 'true',
      ...contactsListFilters(params, {
        role: this.auth.currentUser?.role,
        regionService: this.region,
      }),
    });

    const [contactsResult, agentsResult] = await Promise.all([
      this.auth.fetchJson(`/contacts?${query.toString()}`).catch(() => null),
      this.auth.fetchJson('/users/agents').catch(() => null),
    ]);

    return {
      contacts: contactsResult?.data?.data || [],
      total: contactsResult?.data?.total || 0,
      page: contactsResult?.data?.page || 1,
      limit: contactsResult?.data?.limit || limit,
      tagCounts: contactsResult?.data?.tagCounts || null,
      scopeTotal: contactsResult?.data?.scopeTotal ?? 0,
      agents: agentsResult?.data || [],
    };
  }

  resetController(controller, isExiting) {
    if (isExiting) controller.resetState();
  }
}

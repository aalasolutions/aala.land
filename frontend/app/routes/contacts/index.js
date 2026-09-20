import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { localMidnightIso } from 'land/utils/local-date';

export default class ContactsIndexRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    limit: { refreshModel: true },
    search: { refreshModel: true },
    tag: { refreshModel: true },
    agentId: { refreshModel: true },
    isWhatsapp: { refreshModel: true },
    company: { refreshModel: true },
    nationality: { refreshModel: true },
    dateFrom: { refreshModel: true },
    dateTo: { refreshModel: true },
  };

  async model({
    page = 1,
    limit = 50,
    search = '',
    tag = '',
    agentId = '',
    isWhatsapp = '',
    company = '',
    nationality = '',
    dateFrom = '',
    dateTo = '',
  }) {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    if (agentId) params.set('agentId', agentId);
    if (isWhatsapp) params.set('isWhatsapp', 'true');
    if (company) params.set('company', company);
    if (nationality) params.set('nationality', nationality);
    const fromIso = localMidnightIso(dateFrom);
    const toIso = localMidnightIso(dateTo, 1);
    if (fromIso) params.set('dateFrom', fromIso);
    if (toIso) params.set('dateTo', toIso);

    const [contactsResult, agentsResult] = await Promise.all([
      this.auth.fetchJson(`/contacts?${params.toString()}`).catch(() => null),
      this.auth.fetchJson('/users/agents').catch(() => null),
    ]);

    return {
      contacts: contactsResult?.data?.data || [],
      total: contactsResult?.data?.total || 0,
      page: contactsResult?.data?.page || 1,
      limit: contactsResult?.data?.limit || limit,
      agents: agentsResult?.data || [],
    };
  }

  resetController(controller, isExiting) {
    if (isExiting) controller.resetState();
  }
}

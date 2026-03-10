import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class WhatsappRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    leadId: { refreshModel: true },
  };

  async model({ page = 1, leadId = '' }) {
    const url = leadId
      ? `${this.auth.apiBase}/whatsapp/lead/${leadId}?page=${page}&limit=50`
      : `${this.auth.apiBase}/whatsapp?page=${page}&limit=50`;

    const response = await this.auth.authorizedFetch(url);
    if (!response.ok) return { messages: [], total: 0, leadId };
    const { data } = await response.json();
    return { messages: data.data ?? [], total: data.total ?? 0, leadId };
  }
}

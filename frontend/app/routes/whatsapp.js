import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';

export default class WhatsappRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    page: { refreshModel: true },
    leadId: { refreshModel: true },
  };

  async model({ page = 1, leadId = '' }) {
    const path = leadId
      ? `/whatsapp/lead/${leadId}?page=${page}&limit=50`
      : `/whatsapp?page=${page}&limit=50`;

    try {
      const json = await this.auth.fetchJson(path);
      return { messages: json.data?.data ?? [], total: json.data?.total ?? 0, leadId };
    } catch {
      return { messages: [], total: 0, leadId };
    }
  }
}

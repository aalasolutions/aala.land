import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class ContactsDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model({ contact_id }) {
    const contactResult = await this.auth
      .fetchJson(`/contacts/${contact_id}`)
      .catch(() => null);
    const contact = contactResult?.data || null;
    const tags = contact?.tags || [];

    // Owner and Vendor share the same "units owned" data (Vendor is just
    // Owner with 2+ units), so one fetch covers both tags.
    const [unitsResult, leasesResult, leadsResult] = await Promise.all([
      tags.includes('owner')
        ? this.auth
            .fetchJson(`/properties/units?ownerId=${contact_id}&limit=100`)
            .catch(() => null)
        : null,
      tags.includes('tenant')
        ? this.auth
            .fetchJson(`/leases?contactId=${contact_id}&limit=100`)
            .catch(() => null)
        : null,
      tags.includes('lead')
        ? this.auth
            .fetchJson(`/leads?contactId=${contact_id}&limit=100`)
            .catch(() => null)
        : null,
    ]);

    return {
      contact,
      units: unitsResult?.data?.data || [],
      leases: leasesResult?.data?.data || [],
      leads: leadsResult?.data?.data || [],
    };
  }

  setupController(controller, model, transition) {
    super.setupController(controller, model, transition);
    controller.resetEditState();
  }
}

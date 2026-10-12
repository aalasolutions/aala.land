import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { isLimited } from 'land/utils/contact-display';
import { relatedListUrl } from 'land/utils/contact-related';

const EMPTY_TOTALS = {
  units: 0,
  leases: 0,
  leads: 0,
  activeLeases: 0,
  openLeads: 0,
  availableUnits: 0,
};

export default class ContactsDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model({ contact_id }) {
    const contactResult = await this.auth
      .fetchJson(`/contacts/${contact_id}`)
      .catch(() => null);
    const contact = contactResult?.data || null;
    // A LIMITED view shows no related records, so none are fetched.
    if (isLimited(contact)) {
      return {
        contact,
        units: [],
        leases: [],
        leads: [],
        totals: { ...EMPTY_TOTALS },
        firstActiveLease: null,
        firstOpenLead: null,
      };
    }
    const tags = contact?.tags || [];
    const isOwner = tags.includes('owner');
    const isLead = tags.includes('lead');
    const get = (path) => this.auth.fetchJson(path).catch(() => null);

    // Portfolio owner is just owner with 2+ units, so one fetch of "units owned" covers both tags.
    const [units, leases, leads, activeLease, openLead, availableUnits] =
      await Promise.all([
        isOwner ? get(relatedListUrl('properties', contact_id)) : null,
        // The tenant tag ignores archived leases.
        get(relatedListUrl('leases', contact_id)),
        isLead ? get(relatedListUrl('leads', contact_id)) : null,
        // Archived leases are excluded by default.
        get(`/leases?contactId=${contact_id}&status=ACTIVE&page=1&limit=1`),
        isLead
          ? get(`/leads?contactId=${contact_id}&open=true&page=1&limit=1`)
          : null,
        isOwner
          ? get(
              `/properties/units?ownerId=${contact_id}&status=available&page=1&limit=1`,
            )
          : null,
      ]);

    return {
      contact,
      units: units?.data?.data || [],
      leases: leases?.data?.data || [],
      leads: leads?.data?.data || [],
      totals: {
        units: units?.data?.total || 0,
        leases: leases?.data?.total || 0,
        leads: leads?.data?.total || 0,
        activeLeases: activeLease?.data?.total || 0,
        openLeads: openLead?.data?.total || 0,
        availableUnits: availableUnits?.data?.total || 0,
      },
      firstActiveLease: activeLease?.data?.data?.[0] || null,
      firstOpenLead: openLead?.data?.data?.[0] || null,
    };
  }

  setupController(controller, model, transition) {
    super.setupController(controller, model, transition);
    controller.resetEditState();
    controller.resetPages();
  }

  resetController(controller, isExiting) {
    if (isExiting) {
      controller.resetTab();
      controller.resetPages();
    }
  }
}

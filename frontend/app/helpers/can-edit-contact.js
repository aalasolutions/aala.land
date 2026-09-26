import Helper from '@ember/component/helper';
import { service } from '@ember/service';
import { canEditContact } from '../utils/contact-display';

// The session user has no region codes; the region service holds the assigned regions.
export default class CanEditContactHelper extends Helper {
  @service auth;
  @service region;

  compute([contact]) {
    const user = this.auth.currentUser;
    if (!user) return false;
    const regionCodes = this.region.regions.map((r) => r.code);
    return canEditContact(contact, { ...user, regionCodes });
  }
}

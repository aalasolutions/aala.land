import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { fetchUnitSummary } from '../../utils/unit-summary';

export default class LeasesDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model({ lease_id }) {
    const leaseResult = await this.auth
      .fetchJson(`/leases/${lease_id}`)
      .catch(() => null);
    const lease = leaseResult?.data || null;
    const unit = await fetchUnitSummary(this.auth, lease?.unitId);
    return { lease, unit };
  }
}

import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

// The server scopes the pending count to the caller's regions.
export default class AccessRequestsService extends Service {
  @service auth;

  @tracked pendingCount = 0;

  async loadPendingCount() {
    try {
      const json = await this.auth.fetchJson(
        '/contact-access-requests?status=PENDING&page=1&limit=1',
      );
      this.pendingCount = json.data?.total ?? 0;
    } catch {
      // keep the last count
    }
  }
}

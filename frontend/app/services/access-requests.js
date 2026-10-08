import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

// Pending contact access requests the caller can decide; the server scopes them to the caller's regions.
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

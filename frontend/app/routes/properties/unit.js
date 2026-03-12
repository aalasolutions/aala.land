import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class PropertiesUnitRoute extends AuthenticatedRoute {
  @service auth;

  async model({ area_id, unit_id }) {
    try {
      const [unitJson, leasesJson, ownersJson, mediaJson] = await Promise.all([
        this.auth.fetchJson(`/properties/units/${unit_id}`),
        this.auth.fetchJson(`/leases/unit/${unit_id}`),
        this.auth.fetchJson('/owners?limit=100'),
        this.auth.fetchJson(`/properties/units/${unit_id}/media`),
      ]);

      return {
        unit: unitJson.data || null,
        leases: leasesJson.data || [],
        owners: ownersJson.data?.data || [],
        media: mediaJson.data || [],
        areaId: area_id,
      };
    } catch {
      return { unit: null, leases: [], owners: [], media: [], areaId: area_id };
    }
  }
}

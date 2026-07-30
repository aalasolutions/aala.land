import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class PropertiesUnitRoute extends AuthenticatedRoute {
  @service auth;

  async model({ area_id, unit_id }) {
    try {
      const [unitJson, leasesJson, ownersJson, mediaJson, documentsJson] =
        await Promise.all([
          this.auth.fetchJson(`/properties/units/${unit_id}`),
          this.auth.fetchJson(`/leases/unit/${unit_id}`),
          this.auth.fetchJson('/owners?limit=100'),
          this.auth.fetchJson(`/properties/units/${unit_id}/media`),
          this.auth.fetchJson(`/documents?unitId=${unit_id}&limit=100`),
        ]);

      return {
        unit: unitJson.data || null,
        leases: leasesJson.data || [],
        owners: ownersJson.data?.data || [],
        media: mediaJson.data || [],
        documents: documentsJson.data?.data || [],
        areaId: area_id,
      };
    } catch {
      return {
        unit: null,
        leases: [],
        owners: [],
        media: [],
        documents: [],
        areaId: area_id,
      };
    }
  }

  resetController(controller, isExiting) {
    if (isExiting) {
      controller.revokePreview();
    }
  }
}

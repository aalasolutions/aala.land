import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class PropertiesDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model({ area_id }) {
    try {
      const buildingsJson = await this.auth.fetchJson(`/properties/localities/${area_id}/buildings?limit=100`);

      const buildings = buildingsJson.data?.data ?? [];

      const buildingsWithUnits = await Promise.all(
        buildings.map(async (building) => {
          try {
            const unitsJson = await this.auth.fetchJson(
              `/properties/buildings/${building.id}/units?limit=100`,
            );
            const units = unitsJson.data?.data ?? [];
            return { ...building, units };
          } catch {
            return { ...building, units: [] };
          }
        }),
      );

      return { localityId: area_id, buildings: buildingsWithUnits };
    } catch {
      return { localityId: area_id, buildings: [] };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.loadOwners();
  }
}

import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class PropertiesDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model({ area_id }) {
    try {
      const [areaJson, buildingsJson] = await Promise.all([
        this.auth.fetchJson(`/properties/areas/${area_id}`),
        this.auth.fetchJson('/properties/buildings?limit=100'),
      ]);

      const area = areaJson.data ?? null;
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

      return { area, buildings: buildingsWithUnits };
    } catch {
      return { area: null, buildings: [] };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.loadOwners();
  }
}

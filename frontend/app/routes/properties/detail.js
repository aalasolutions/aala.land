import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class PropertiesDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model({ area_id }) {
    const [areaRes, buildingsRes] = await Promise.all([
      this.auth.authorizedFetch(`${this.auth.apiBase}/properties/areas/${area_id}`),
      this.auth.authorizedFetch(`${this.auth.apiBase}/properties/areas/${area_id}/buildings?limit=100`),
    ]);

    const area = areaRes.ok ? (await areaRes.json()).data : null;
    const buildingsResponse = buildingsRes.ok ? (await buildingsRes.json()).data : { data: [] };
    const buildings = buildingsResponse.data ?? [];

    const buildingsWithUnits = await Promise.all(
      buildings.map(async (building) => {
        const unitsRes = await this.auth.authorizedFetch(
          `${this.auth.apiBase}/properties/buildings/${building.id}/units?limit=100`,
        );
        const unitsResponse = unitsRes.ok ? (await unitsRes.json()).data : { data: [] };
        const units = unitsResponse.data ?? [];
        return { ...building, units };
      }),
    );

    return { area, buildings: buildingsWithUnits };
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.loadOwners();
  }
}

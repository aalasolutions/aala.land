import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class PropertiesDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model({ area_id }) {
    try {
      const assetsJson = await this.auth.fetchJson(`/properties/localities/${area_id}/assets?limit=100`);

      const assets = assetsJson.data?.data ?? [];

      const assetsWithUnits = await Promise.all(
        assets.map(async (asset) => {
          try {
            const unitsJson = await this.auth.fetchJson(
              `/properties/assets/${asset.id}/units?limit=100`,
            );
            const units = unitsJson.data?.data ?? [];
            return { ...asset, units };
          } catch {
            return { ...asset, units: [] };
          }
        }),
      );

      return { localityId: area_id, assets: assetsWithUnits };
    } catch {
      return { localityId: area_id, assets: [] };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.loadOwners();
  }
}

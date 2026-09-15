import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { ARCHIVED_FILTER_OPTIONS } from 'land/constants';

const ARCHIVED_FILTERS = ARCHIVED_FILTER_OPTIONS.map((o) => o.value);

export default class PropertiesDetailRoute extends AuthenticatedRoute {
  @service auth;

  queryParams = {
    archived: { refreshModel: true },
  };

  async model({ area_id, archived }) {
    const archivedParam =
      ARCHIVED_FILTERS.includes(archived) && archived !== 'exclude'
        ? `&archived=${archived}`
        : '';
    try {
      const assetsJson = await this.auth.fetchJson(
        `/properties/localities/${area_id}/assets?limit=100`,
      );

      const assets = assetsJson.data?.data ?? [];

      const assetsWithUnits = await Promise.all(
        assets.map(async (asset) => {
          try {
            const unitsJson = await this.auth.fetchJson(
              `/properties/assets/${asset.id}/units?limit=100${archivedParam}`,
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
}

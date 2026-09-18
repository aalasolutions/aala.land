import Controller from '@ember/controller';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { timeAgo as formatTimeAgo } from '../utils/local-date';

export default class DashboardController extends Controller {
  @service region;

  get regionLabel() {
    return this.region.activeRegion?.name ?? 'All Regions';
  }

  get occupancyRate() {
    const kpis = this.model?.kpis;
    if (!kpis || !kpis.totalUnits) return 0;
    const leased = kpis.activeLeases || 0;
    const total = kpis.totalUnits;
    return Math.round((leased / total) * 100);
  }

  get maxPipelineCount() {
    const pipeline = this.model?.pipeline || [];
    return Math.max(...pipeline.map((s) => s.count), 1);
  }

  pipelineWidth = (count) => {
    return Math.max(Math.round((count / this.maxPipelineCount) * 100), 2);
  };

  pipelineBarStyle = (count) => {
    return htmlSafe(`width:${this.pipelineWidth(count)}%;`);
  };

  pipelineColor = (stage) => {
    const colors = {
      NEW: 'info',
      CONTACTED: 'secondary',
      VIEWING: 'warning',
      NEGOTIATING: 'warning',
      WON: 'success',
      LOST: 'danger',
    };
    return colors[stage] || 'primary';
  };

  activityColor = (entityType) => {
    const colors = {
      Lead: 'primary',
      Transaction: 'secondary',
      Lease: 'success',
      WorkOrder: 'warning',
      Cheque: 'secondary',
      User: 'info',
    };
    return colors[entityType] || 'primary';
  };

  timeAgo = (dateStr) => formatTimeAgo(dateStr);
}

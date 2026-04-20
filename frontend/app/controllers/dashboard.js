import Controller from '@ember/controller';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';

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
      NEW: 'primary',
      CONTACTED: 'primary-light',
      VIEWING: 'info',
      NEGOTIATING: 'warning',
      WON: 'success',
      LOST: 'danger',
    };
    return colors[stage] || 'primary';
  };

  activityColor = (entityType) => {
    const colors = {
      Lead: 'primary',
      Transaction: 'coral',
      Lease: 'success',
      WorkOrder: 'warning',
      Cheque: 'coral',
      User: 'info',
    };
    return colors[entityType] || 'primary';
  };

  timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };
}

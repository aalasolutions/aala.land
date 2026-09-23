import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VISIBLE_FLAGS_PER_GROUP = 10;

const TAB_IDS = ['pipeline', 'alerts', 'activity'];

const SEVERITY_VARIANTS = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'secondary',
};

const ACTION_VARIANTS = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  BULK_DELETE: 'danger',
  ASSIGN: 'info',
};

function titleCase(value) {
  return String(value ?? '')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default class ReportsController extends PaginatedController {
  queryParams = ['tab', 'page', 'limit'];

  @tracked tab = 'pipeline';

  @tracked expandedFlagGroups = new Set();

  columns = [
    { name: 'Agent', valuePath: 'agentName', width: 220, isFixed: 'left' },
    { name: 'Leads', valuePath: 'leadsAssigned', width: 120, numeric: true },
    { name: 'Won', valuePath: 'leadsWon', width: 120, numeric: true },
    { name: 'Lost', valuePath: 'leadsLost', width: 120, numeric: true },
    {
      name: 'Conversion',
      valuePath: 'conversionRate',
      width: 140,
      numeric: true,
    },
    {
      name: 'Commissions',
      valuePath: 'commissionsEarned',
      width: 160,
      numeric: true,
    },
  ];

  activityColumns = [
    {
      name: 'Date',
      valuePath: 'createdAt',
      width: 180,
      isFixed: 'left',
      numeric: true,
    },
    { name: 'Action', valuePath: 'actionLabel', width: 140 },
    { name: 'Record', valuePath: 'entityType', width: 200 },
    { name: 'By', valuePath: 'userName', width: 220 },
  ];

  get currentTab() {
    return TAB_IDS.includes(this.tab) ? this.tab : 'pipeline';
  }

  get tabs() {
    return [
      { id: 'pipeline', label: 'Pipeline & Agents' },
      {
        id: 'alerts',
        label: 'Alerts',
        count: (this.model?.redFlags ?? []).reduce(
          (sum, check) => sum + check.total,
          0,
        ),
      },
      { id: 'activity', label: 'Activity Logs', count: this.model?.total },
    ];
  }

  get revenuePoints() {
    return (this.model?.revenueTrend ?? []).map((point) => ({
      month: point.month,
      value: Number(point.total) || 0,
    }));
  }

  get winRate() {
    const kpis = this.model?.kpis;
    if (!kpis?.totalLeads) return 0;
    return Math.round(((kpis.wonLeads || 0) / kpis.totalLeads) * 100);
  }

  get flagGroups() {
    return (this.model?.redFlags ?? []).map((check) => {
      const expanded = this.expandedFlagGroups.has(check.type);
      const visible = expanded
        ? check.flags
        : check.flags.slice(0, VISIBLE_FLAGS_PER_GROUP);
      return {
        type: check.type,
        label: check.label,
        variant: SEVERITY_VARIANTS[check.severity] ?? 'secondary',
        severityLabel: titleCase(check.severity),
        total: check.total,
        listedCount: check.flags.length,
        visible,
        hiddenCount: check.flags.length - visible.length,
        isTruncated: check.total > check.flags.length,
      };
    });
  }

  get activityRows() {
    return (this.model?.activity ?? []).map((item) => ({
      ...item,
      actionLabel: titleCase(item.action),
      actionVariant: ACTION_VARIANTS[item.action] ?? 'secondary',
    }));
  }

  // Agent performance rows carry `agentId`, not the `id` DataTable keys rows by.
  get agentRows() {
    return (this.model?.agents ?? []).map((agent) => ({
      ...agent,
      id: agent.agentId,
    }));
  }

  @action setTab(tab) {
    this.tab = tab;
  }

  @action showAllFlags(type) {
    this.expandedFlagGroups = new Set([...this.expandedFlagGroups, type]);
  }
}

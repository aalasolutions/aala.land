import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VISIBLE_FLAGS_PER_GROUP = 10;

const TAB_IDS = ['pipeline', 'alerts', 'activity'];

// Every check always renders, so an empty one reads as passed rather than missing.
const FLAG_TYPES = [
  {
    type: 'UNTOUCHED_LEAD_48H',
    label: 'Leads untouched for 48+ hours',
    severity: 'HIGH',
  },
  {
    type: 'UNTOUCHED_LEAD_24H',
    label: 'Leads untouched for 24+ hours',
    severity: 'MEDIUM',
  },
  {
    type: 'STALLED_PIPELINE',
    label: 'Leads stalled in negotiation for 14+ days',
    severity: 'MEDIUM',
  },
  {
    type: 'OVERDUE_FOLLOWUP',
    label: 'Leads with no follow-up for 7+ days',
    severity: 'MEDIUM',
  },
  {
    type: 'LONG_VACANT',
    label: 'Properties vacant for 30+ days',
    severity: 'LOW',
  },
];

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
    { name: 'Leads', valuePath: 'leadsAssigned', width: 120 },
    { name: 'Won', valuePath: 'leadsWon', width: 120 },
    { name: 'Lost', valuePath: 'leadsLost', width: 120 },
    { name: 'Conversion', valuePath: 'conversionRate', width: 140 },
    { name: 'Commissions', valuePath: 'commissionsEarned', width: 160 },
  ];

  activityColumns = [
    { name: 'Date', valuePath: 'createdAt', width: 180, isFixed: 'left' },
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
      { id: 'alerts', label: 'Alerts', count: this.model?.redFlags?.length },
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
    const group = (type, label, severity) => ({
      type,
      label,
      variant: SEVERITY_VARIANTS[severity] ?? 'secondary',
      severityLabel: titleCase(severity),
      flags: [],
    });
    const groups = new Map(
      FLAG_TYPES.map((t) => [t.type, group(t.type, t.label, t.severity)]),
    );
    for (const flag of this.model?.redFlags ?? []) {
      if (!groups.has(flag.type)) {
        groups.set(
          flag.type,
          group(flag.type, titleCase(flag.type), flag.severity),
        );
      }
      groups.get(flag.type).flags.push(flag);
    }
    return [...groups.values()].map((group) => {
      const expanded = this.expandedFlagGroups.has(group.type);
      return {
        ...group,
        count: group.flags.length,
        visible: expanded
          ? group.flags
          : group.flags.slice(0, VISIBLE_FLAGS_PER_GROUP),
        hiddenCount: expanded
          ? 0
          : Math.max(group.flags.length - VISIBLE_FLAGS_PER_GROUP, 0),
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

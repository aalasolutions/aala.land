import Controller from '@ember/controller';

export default class ReportsController extends Controller {
  columns = [
    { name: 'Agent', valuePath: 'agentName', width: 220, isFixed: 'left' },
    { name: 'Leads', valuePath: 'leadsAssigned', width: 120 },
    { name: 'Won', valuePath: 'leadsWon', width: 120 },
    { name: 'Lost', valuePath: 'leadsLost', width: 120 },
    { name: 'Conversion', valuePath: 'conversionRate', width: 140 },
    { name: 'Commissions', valuePath: 'commissionsEarned', width: 160 },
  ];

  // Agent performance rows carry `agentId`, not the `id` DataTable keys rows by.
  get agentRows() {
    return (this.model?.agents ?? []).map((agent) => ({
      ...agent,
      id: agent.agentId,
    }));
  }
}

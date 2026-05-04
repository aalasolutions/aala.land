import Component from '@glimmer/component';

export default class SearchDropdownComponent extends Component {
  get groupedResults() {
    const results = this.args.results;
    if (!results) {
      return [];
    }

    let index = 0;
    const groups = [];

    if (results.properties?.length) {
      groups.push({
        label: 'Properties',
        groupId: 'search-group-properties-label',
        items: results.properties.map(result => ({
          id: `search-result-item-${index}`,
          index: index++,
          value: result,
        })),
      });
    }

    if (results.agents?.length) {
      groups.push({
        label: 'Agents',
        groupId: 'search-group-agents-label',
        items: results.agents.map(agent => ({
          id: `search-result-item-${index}`,
          index: index++,
          value: agent,
        })),
      });
    }

    return groups;
  }
}

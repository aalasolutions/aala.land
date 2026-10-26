import Component from '@glimmer/component';

export default class NuBreadcrumbComponent extends Component {
  get classes() {
    const parts = ['wu-breadcrumb'];
    if (this.args.compact) {
      parts.push('m-compact');
    }
    return parts.join(' ');
  }

  // @parentsOnly: every item is a link to an ancestor; the current page is the host's h1.
  get items() {
    const items = this.args.items || [];
    const lastIndex = this.args.parentsOnly ? -1 : items.length - 1;
    return items.map((item, index) => ({
      ...item,
      current: index === lastIndex,
      linkModels: item.models ?? (item.model == null ? [] : [item.model]),
    }));
  }
}

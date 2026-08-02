import Component from '@glimmer/component';

export default class NuBreadcrumbComponent extends Component {
  get classes() {
    const parts = ['nu-breadcrumb'];
    if (this.args.compact) {
      parts.push('m-compact');
    }
    return parts.join(' ');
  }

  get items() {
    const items = this.args.items || [];
    const lastIndex = items.length - 1;
    return items.map((item, index) => ({
      ...item,
      current: index === lastIndex,
    }));
  }
}

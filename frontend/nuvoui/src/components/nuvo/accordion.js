import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class NuAccordionComponent extends Component {
  @tracked expandedIds = this.initialExpandedIds;

  get initialExpandedIds() {
    const defaultExpanded = this.args.defaultExpanded;
    if (Array.isArray(defaultExpanded)) {
      return defaultExpanded;
    }
    if (defaultExpanded !== undefined && defaultExpanded !== null) {
      return [defaultExpanded];
    }
    return [];
  }

  get classes() {
    const parts = ['nu-accordion'];
    if (this.args.bordered) {
      parts.push('m-bordered');
    }
    if (this.args.flush) {
      parts.push('m-flush');
    }
    if (this.args.compact) {
      parts.push('m-compact');
    }
    return parts.join(' ');
  }

  get items() {
    return (this.args.items || []).map((item) => ({
      ...item,
      expanded: this.expandedIds.includes(item.id),
    }));
  }

  @action
  toggle(item) {
    if (item.disabled) {
      return;
    }
    const isExpanded = this.expandedIds.includes(item.id);
    if (isExpanded) {
      this.expandedIds = this.expandedIds.filter((id) => id !== item.id);
    } else if (this.args.multiple) {
      this.expandedIds = [...this.expandedIds, item.id];
    } else {
      this.expandedIds = [item.id];
    }
  }
}

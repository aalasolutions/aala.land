import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WovenAccordionComponent extends Component {
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
    return this.args.animated === false
      ? 'wu-accordion'
      : 'wu-accordion animated';
  }

  get items() {
    return (this.args.items || []).map((item) => ({
      ...item,
      expanded: this.expandedIds.includes(item.id),
    }));
  }

  @action
  preventDisabledToggle(item, event) {
    if (item.disabled) {
      event.preventDefault();
    }
  }

  // Syncs state from the native toggle; no-op when the DOM already matches, so programmatic closes do not loop.
  @action
  onToggle(item, event) {
    const open = event.target.open;
    const isExpanded = this.expandedIds.includes(item.id);
    if (open === isExpanded) {
      return;
    }
    if (!open) {
      this.expandedIds = this.expandedIds.filter((id) => id !== item.id);
    } else if (this.args.multiple) {
      this.expandedIds = [...this.expandedIds, item.id];
    } else {
      this.expandedIds = [item.id];
    }
  }
}

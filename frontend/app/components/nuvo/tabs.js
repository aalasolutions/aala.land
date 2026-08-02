import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANTS = ['underline', 'pills', 'enclosed'];

export default class NuTabsComponent extends Component {
  @tracked internalActiveTab = undefined;

  rootElement = null;

  // Controlled when @activeTab is passed, uncontrolled otherwise - same
  // pattern as NuDropdown's currentValue getter.
  get currentTab() {
    return this.args.activeTab !== undefined
      ? this.args.activeTab
      : (this.internalActiveTab ?? this.enabledTabs[0]?.id);
  }

  get enabledTabs() {
    return (this.args.tabs || []).filter((tab) => !tab.disabled);
  }

  get classes() {
    const parts = ['nu-tabs'];
    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (this.args.vertical) {
      parts.push('m-vertical');
    }
    if (this.args.fill) {
      parts.push('m-fill');
    }
    return parts.join(' ');
  }

  get tabs() {
    return (this.args.tabs || []).map((tab) => ({
      ...tab,
      active: tab.id === this.currentTab,
    }));
  }

  @action
  registerRoot(element) {
    this.rootElement = element;
  }

  @action
  selectTab(tab) {
    if (tab.disabled) {
      return;
    }
    this.internalActiveTab = tab.id;
    this.args.onChange?.(tab.id, tab);
  }

  @action
  handleKeydown(event) {
    const enabled = this.enabledTabs;
    if (!enabled.length) {
      return;
    }

    const forwardKey = this.args.vertical ? 'ArrowDown' : 'ArrowRight';
    const backwardKey = this.args.vertical ? 'ArrowUp' : 'ArrowLeft';

    if (![forwardKey, backwardKey, 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const currentIndex = enabled.findIndex((tab) => tab.id === this.currentTab);
    let nextIndex = currentIndex;

    if (event.key === forwardKey) {
      nextIndex = (currentIndex + 1) % enabled.length;
    } else if (event.key === backwardKey) {
      nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = enabled.length - 1;
    }

    const nextTab = enabled[nextIndex];
    this.selectTab(nextTab);
    this.rootElement
      ?.querySelector(`[data-test-nu-tabs-trigger="${nextTab.id}"]`)
      ?.focus();
  }
}

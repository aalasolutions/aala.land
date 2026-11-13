import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';

// Kit has no pills or sizes: pills maps to boxed, size is ignored.
const VARIANT_CLASSES = { enclosed: 'card', pills: 'boxed' };

export default class WovenTabsComponent extends Component {
  @tracked internalActiveTab = undefined;

  rootElement = null;

  // Controlled when @activeTab is passed, uncontrolled otherwise.
  get currentTab() {
    return this.args.activeTab !== undefined
      ? this.args.activeTab
      : (this.internalActiveTab ?? this.enabledTabs[0]?.id);
  }

  get enabledTabs() {
    return (this.args.tabs || []).filter((tab) => !tab.disabled);
  }

  get classes() {
    const parts = ['wu-tabs'];
    const variant = VARIANT_CLASSES[this.args.variant];
    if (variant) {
      parts.push(variant);
    }
    if (this.args.vertical) {
      parts.push('vertical');
    }
    return parts.join(' ');
  }

  get rootId() {
    return `wu-tabs-${guidFor(this)}`;
  }

  get panelId() {
    return `${this.rootId}-panel`;
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

    // Horizontal arrows follow the reading direction.
    const rtl = document.documentElement.dir === 'rtl';
    const forwardKey = this.args.vertical
      ? 'ArrowDown'
      : rtl
        ? 'ArrowLeft'
        : 'ArrowRight';
    const backwardKey = this.args.vertical
      ? 'ArrowUp'
      : rtl
        ? 'ArrowRight'
        : 'ArrowLeft';

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
    this.rootElement?.querySelector(`[data-tab-id="${nextTab.id}"]`)?.focus();
  }
}

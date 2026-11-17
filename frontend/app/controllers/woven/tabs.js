import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WovenTabsController extends Controller {
  @tracked activeUnitTab = 'overview';

  unitTabs = [
    { id: 'overview', label: 'Overview', icon: 'squares-four' },
    { id: 'lease', label: 'Lease', icon: 'file-text', count: 1 },
    { id: 'cheques', label: 'Cheques', icon: 'bank', count: 4 },
    { id: 'maintenance', label: 'Maintenance', icon: 'wrench', disabled: true },
  ];

  plainTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'lease', label: 'Lease' },
    { id: 'cheques', label: 'Cheques' },
  ];

  @action
  updateUnitTab(tabId) {
    this.activeUnitTab = tabId;
  }

  code = {
    controlled: `<Woven::Tabs @tabs={{this.unitTabs}} @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} as |tabId|>
  {{#if (eq tabId "overview")}}
    <Woven::Text @text="Unit 1204, Marina Tower - 2BR, sea view, currently leased." />
  {{else if (eq tabId "lease")}}
    <Woven::Text @text="Leased to Ahmed Khalid, AED 8,500/month, renews 31 Dec 2026." />
  {{else if (eq tabId "cheques")}}
    <Woven::Text @text="4 post-dated cheques on file, next due 1 Sep 2026." />
  {{/if}}
</Woven::Tabs>

// unitTabs: [{ id, label, icon }, { id, label, icon, count: 1 }, ..., { id, label, icon, disabled: true }]`,
    uncontrolled: `<Woven::Tabs @tabs={{this.plainTabs}} as |tabId|>
  <Woven::Text @text="Active: {{tabId}}" />
</Woven::Tabs>`,
    listOnly: `<Woven::Tabs @tabs={{this.plainTabs}} @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} />`,
    underline: `<Woven::Tabs @tabs={{this.unitTabs}} @variant="underline" @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} />`,
    pills: `<Woven::Tabs @tabs={{this.unitTabs}} @variant="pills" @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} as |tabId|>
  <Woven::Text @text="Panel for {{tabId}}." />
</Woven::Tabs>`,
    iconSlot: `<Woven::Tabs @tabs={{this.unitTabs}} @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}}>
  <:icon as |tab|><MyOwnIcon @name={{tab.icon}} /></:icon>
</Woven::Tabs>`,
    enclosed: `<Woven::Tabs @tabs={{this.unitTabs}} @variant="enclosed" @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} as |tabId|>
  <Woven::Text @text="Panel for {{tabId}}." />
</Woven::Tabs>`,
    vertical: `<Woven::Tabs @tabs={{this.unitTabs}} @vertical={{true}} @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} as |tabId|>
  <Woven::Text @text="Panel for {{tabId}}." />
</Woven::Tabs>`,
  };

  argRows = [
    { name: '@tabs', type: 'array', default: '[]', description: 'Objects with id, label and optional icon (Phosphor name), count and disabled.' },
    { name: '@activeTab', type: 'string', default: '', description: 'Controlled active id. Omit for uncontrolled mode, which starts on the first enabled tab.' },
    { name: '@variant', type: '"underline" | "pills" | "enclosed"', default: '', description: 'Kit style: underline and no value render the default line, pills renders boxed, enclosed renders card.' },
    { name: '@vertical', type: 'boolean', default: 'false', description: 'Kit vertical modifier: tab list at the inline start; arrow keys switch to up and down.' },
  ];

  callbackRows = [
    { name: '@onChange', signature: '(tabId, tab)', description: 'A tab was selected by click or keyboard. Also fires in uncontrolled mode.' },
  ];

  blockRows = [
    { name: 'default', description: 'Panel content in the kit wu-tabs-panel, yielded the active tab id. Without a block only the tab list renders.' },
    { name: 'icon', description: 'Yields the tab; replaces the Phosphor icon drawn from tab.icon.' },
  ];
}

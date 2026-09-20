import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class NuvoTabsController extends Controller {
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
    controlled: `<Nuvo::Tabs @tabs={{this.unitTabs}} @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} as |tabId|>
  {{#if (eq tabId "overview")}}
    <Nuvo::Text @text="Unit 1204, Marina Tower - 2BR, sea view, currently leased." />
  {{else if (eq tabId "lease")}}
    <Nuvo::Text @text="Leased to Ahmed Khalid, AED 8,500/month, renews 31 Dec 2026." />
  {{else if (eq tabId "cheques")}}
    <Nuvo::Text @text="4 post-dated cheques on file, next due 1 Sep 2026." />
  {{/if}}
</Nuvo::Tabs>

// unitTabs: [{ id, label, icon }, { id, label, icon, count: 1 }, ..., { id, label, icon, disabled: true }]`,
    uncontrolled: `<Nuvo::Tabs @tabs={{this.plainTabs}} as |tabId|>
  <Nuvo::Text @text="Active: {{tabId}}" />
</Nuvo::Tabs>`,
    listOnly: `<Nuvo::Tabs @tabs={{this.plainTabs}} @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} />`,
    underline: `<Nuvo::Tabs @tabs={{this.unitTabs}} @variant="underline" @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} />`,
    pills: `<Nuvo::Tabs @tabs={{this.unitTabs}} @variant="pills" @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} />`,
    enclosed: `<Nuvo::Tabs @tabs={{this.unitTabs}} @variant="enclosed" @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} />`,
    vertical: `<Nuvo::Tabs @tabs={{this.unitTabs}} @vertical={{true}} @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} />`,
    fill: `<Nuvo::Tabs @tabs={{this.unitTabs}} @fill={{true}} @activeTab={{this.activeUnitTab}} @onChange={{this.updateUnitTab}} />`,
  };

  argRows = [
    { name: '@tabs', type: 'array', default: '[]', description: 'Objects with id, label and optional icon (Phosphor name), count and disabled.' },
    { name: '@activeTab', type: 'string', default: '', description: 'Controlled active id. Omit for uncontrolled mode, which starts on the first enabled tab.' },
    { name: '@variant', type: '"underline" | "pills" | "enclosed"', default: '', description: 'Visual style of the tab list.' },
    { name: '@vertical', type: 'boolean', default: 'false', description: 'Stacks the tab list; arrow keys switch to up and down.' },
    { name: '@fill', type: 'boolean', default: 'false', description: 'Tabs share the full width equally.' },
  ];

  callbackRows = [
    { name: '@onChange', signature: '(tabId, tab)', description: 'A tab was selected by click or keyboard. Also fires in uncontrolled mode.' },
  ];

  blockRows = [
    { name: 'default', description: 'Panel content, yielded the active tab id. Without a block only the tab list renders.' },
  ];
}

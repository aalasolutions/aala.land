import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class NuvoBreadcrumbController extends Controller {
  @tracked lastCrumb = 'none yet';

  breadcrumbItems = [
    { label: 'Properties', href: '#' },
    { label: 'Marina Tower', href: '#' },
    { label: 'Unit 1204' },
  ];

  singleItem = [{ label: 'Properties' }];

  get clickItems() {
    return [
      { label: 'Properties', onClick: () => this.noteCrumb('Properties') },
      { label: 'Marina Tower', onClick: () => this.noteCrumb('Marina Tower') },
      { label: 'Unit 1204' },
    ];
  }

  @action
  noteCrumb(label) {
    this.lastCrumb = label;
  }

  code = {
    basic: `<Nuvo::Breadcrumb @items={{this.breadcrumbItems}} />

// breadcrumbItems: [{ label: 'Properties', href: '#' }, { label: 'Marina Tower', href: '#' }, { label: 'Unit 1204' }]`,
    click: `<Nuvo::Breadcrumb @items={{this.clickItems}} />

// clickItems: [{ label, onClick }, { label, onClick }, { label }]`,
    compact: `<Nuvo::Breadcrumb @items={{this.breadcrumbItems}} @compact={{true}} />`,
    single: `<Nuvo::Breadcrumb @items={{this.singleItem}} />`,
  };

  argRows = [
    { name: '@items', type: 'array', default: '[]', description: 'Objects with label and either href or onClick. The last item is the current page and renders as text.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Smaller type and tighter separators.' },
  ];

  itemRows = [
    { name: 'label', type: 'string', default: '', description: 'Visible text.' },
    { name: 'href', type: 'string', default: '"#"', description: 'Renders an anchor.' },
    { name: 'onClick', type: 'function', default: '', description: 'Renders a button instead of an anchor; takes precedence over href.' },
  ];
}

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

  routeItems = [
    { label: 'Components', route: 'nuvo.index' },
    { label: 'Page header', route: 'nuvo.page-header' },
  ];

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
    routes: `<Nuvo::Breadcrumb @items={{this.routeItems}} @compact={{true}} @parentsOnly={{true}} />

// routeItems: [{ label: 'Properties', route: 'properties' }, { label: 'Marina', route: 'properties.detail', model: areaId }]`,
    compact: `<Nuvo::Breadcrumb @items={{this.breadcrumbItems}} @compact={{true}} />`,
    single: `<Nuvo::Breadcrumb @items={{this.singleItem}} />`,
  };

  argRows = [
    { name: '@items', type: 'array', default: '[]', description: 'Objects with label and one of route, href or onClick. The last item is the current page and renders as text unless @parentsOnly is set.' },
    { name: '@parentsOnly', type: 'boolean', default: 'false', description: 'Every item is a parent link; none is marked current. Use in a page header, where the title names the current page.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Smaller type and tighter separators.' },
  ];

  itemRows = [
    { name: 'label', type: 'string', default: '', description: 'Visible text.' },
    { name: 'route', type: 'string', default: '', description: 'Renders a router link; takes precedence over onClick and href.' },
    { name: 'model', type: 'any', default: '', description: 'Single dynamic segment for route.' },
    { name: 'models', type: 'array', default: '', description: 'Several dynamic segments for route; takes precedence over model.' },
    { name: 'href', type: 'string', default: '"#"', description: 'Renders an anchor.' },
    { name: 'onClick', type: 'function', default: '', description: 'Renders a button instead of an anchor; takes precedence over href.' },
  ];
}

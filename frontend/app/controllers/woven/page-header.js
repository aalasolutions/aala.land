import Controller from '@ember/controller';

export default class WovenPageHeaderController extends Controller {
  code = {
    title: `<Woven::PageHeader @title="Properties" />`,
    subtitle: `<Woven::PageHeader @title="Marina Tower" @subtitle="42 units - Dubai Marina" />`,
    bordered: `<Woven::PageHeader @title="Bordered" @subtitle="A rule under the header" @bordered={{true}} />`,
    breadcrumb: `<Woven::PageHeader @title="Marina Tower">
  <:breadcrumb>
    <Woven::Breadcrumb @items={{this.crumbs}} @compact={{true}} @parentsOnly={{true}} />
  </:breadcrumb>
</Woven::PageHeader>`,
    meta: `<Woven::PageHeader @title="Marina Tower" @subtitle="42 units - Dubai Marina">
  <:meta>
    <Woven::Tag @variant="success" @text="Active" />
    <span>Occupancy 91%</span>
  </:meta>
</Woven::PageHeader>`,
    actions: `<Woven::PageHeader @title="Marina Tower">
  <:actions>
    <Woven::Button @size="sm" @text="Export" />
    <Woven::Button @variant="brand" @size="sm" @text="Add Unit" />
  </:actions>
</Woven::PageHeader>`,
  };

  crumbs = [{ label: 'Properties', href: '#' }];

  argRows = [
    { name: '@title', type: 'string', default: '', description: 'Page title, rendered as the h1.' },
    { name: '@subtitle', type: 'string', default: '', description: 'Line under the title.' },
    { name: '@bordered', type: 'boolean', default: 'false', description: 'Kit divided modifier: bottom border and padding.' },
  ];

  blockRows = [
    { name: 'breadcrumb', description: 'Trail on its own row above the title; pass a Woven::Breadcrumb.' },
    { name: 'meta', description: 'Tags, badges and short facts beside the title, such as a status or a count.' },
    { name: 'actions', description: 'Buttons aligned to the inline end.' },
  ];
}

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
    <Woven::Badge @variant="success" @text="Active" />
    <span>Occupancy 91%</span>
  </:meta>
</Woven::PageHeader>`,
    actions: `<Woven::PageHeader @title="Marina Tower">
  <:actions>
    <Woven::Button @variant="secondary" @size="sm" @text="Export" />
    <Woven::Button @variant="primary" @size="sm" @text="Add Unit" />
  </:actions>
</Woven::PageHeader>`,
    sticky: `<div class="scroll-container">
  <Woven::PageHeader @title="Sticky header" @subtitle="stays pinned in a scroll container" @sticky={{true}} />
  ...long content...
</div>`,
  };

  crumbs = [{ label: 'Properties', href: '#' }];

  argRows = [
    { name: '@title', type: 'string', default: '', description: 'Page title, rendered as the h1.' },
    { name: '@subtitle', type: 'string', default: '', description: 'Line under the title.' },
    { name: '@bordered', type: 'boolean', default: 'false', description: 'Bottom border.' },
    { name: '@sticky', type: 'boolean', default: 'false', description: 'Sticks to the top of its scroll container.' },
  ];

  blockRows = [
    { name: 'breadcrumb', description: 'Trail above the title.' },
    { name: 'meta', description: 'Badges and short facts under the subtitle.' },
    { name: 'actions', description: 'Buttons aligned to the inline end.' },
  ];

  filler = Array.from({ length: 8 }, (_, index) => `Row ${index + 1} of scrolling content.`);
}

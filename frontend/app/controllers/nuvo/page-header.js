import Controller from '@ember/controller';

export default class NuvoPageHeaderController extends Controller {
  code = {
    title: `<Nuvo::PageHeader @title="Properties" />`,
    subtitle: `<Nuvo::PageHeader @title="Marina Tower" @subtitle="42 units - Dubai Marina" />`,
    icon: `<Nuvo::PageHeader @icon="buildings" @title="Properties" @subtitle="Every building in the active region" />`,
    bordered: `<Nuvo::PageHeader @title="Bordered" @subtitle="A rule under the header" @bordered={{true}} />`,
    breadcrumb: `<Nuvo::PageHeader @title="Marina Tower">
  <:breadcrumb>
    <Nuvo::Breadcrumb @items={{this.crumbs}} @compact={{true}} />
  </:breadcrumb>
</Nuvo::PageHeader>`,
    meta: `<Nuvo::PageHeader @title="Marina Tower" @subtitle="42 units - Dubai Marina">
  <:meta>
    <Nuvo::Badge @variant="success" @text="Active" />
    <span>Occupancy 91%</span>
  </:meta>
</Nuvo::PageHeader>`,
    actions: `<Nuvo::PageHeader @title="Marina Tower">
  <:actions>
    <Nuvo::Button @variant="secondary" @size="sm" @text="Export" />
    <Nuvo::Button @variant="primary" @size="sm" @text="Add Unit" />
  </:actions>
</Nuvo::PageHeader>`,
    sticky: `<div class="scroll-container">
  <Nuvo::PageHeader @title="Sticky header" @subtitle="stays pinned in a scroll container" @sticky={{true}} />
  ...long content...
</div>`,
  };

  crumbs = [
    { label: 'Properties', href: '#' },
    { label: 'Marina Tower' },
  ];

  argRows = [
    { name: '@title', type: 'string', default: '', description: 'Page title, rendered as the h1.' },
    { name: '@subtitle', type: 'string', default: '', description: 'Line under the title.' },
    { name: '@icon', type: 'string', default: '', description: 'Phosphor icon name rendered before the title.' },
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

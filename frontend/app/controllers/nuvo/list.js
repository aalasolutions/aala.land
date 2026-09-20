import Controller from '@ember/controller';

export default class NuvoListController extends Controller {
  unitList = [
    'Marina Tower - Unit 1204',
    'Downtown Loft - Unit 802',
    'JVC Residence - Unit 15A',
  ];

  iconList = [
    { label: 'Parking bay', icon: '🅿' },
    { label: 'Pool access', icon: '🏊' },
    { label: 'Gym', icon: '🏋' },
  ];

  leaseDescItems = [
    { term: 'Tenant', description: 'Ahmed Al Farsi' },
    { term: 'Unit', description: 'Marina Tower - 1204' },
    { term: 'Monthly Rent', description: 'AED 8,500' },
    { term: 'Lease Ends', description: '31 Dec 2026' },
  ];

  code = {
    strings: `<Nuvo::List @items={{this.unitList}} />

// unitList: ['Marina Tower - Unit 1204', ...]`,
    icons: `<Nuvo::List @items={{this.iconList}} @plain={{true}} />

// iconList: [{ label: 'Parking bay', icon: '🅿' }, ...]`,
    ordered: `<Nuvo::List @items={{this.unitList}} @ordered={{true}} />`,
    plain: `<Nuvo::List @items={{this.unitList}} @plain={{true}} />`,
    inline: `<Nuvo::List @items={{this.unitList}} @inline={{true}} />`,
    bordered: `<Nuvo::List @items={{this.unitList}} @plain={{true}} @bordered={{true}} />`,
    compact: `<Nuvo::List @items={{this.unitList}} @compact={{true}} />`,
    block: `<Nuvo::List @plain={{true}}>
  <li class="nu-list__item"><Nuvo::Badge @variant="success" @text="Paid" /> March rent</li>
  <li class="nu-list__item"><Nuvo::Badge @variant="warning" @text="Due" /> April rent</li>
</Nuvo::List>`,
    desc: `<Nuvo::DescList @items={{this.leaseDescItems}} />

// leaseDescItems: [{ term: 'Tenant', description: 'Ahmed Al Farsi' }, ...]`,
    descHorizontal: `<Nuvo::DescList @items={{this.leaseDescItems}} @horizontal={{true}} />`,
    descCompact: `<Nuvo::DescList @items={{this.leaseDescItems}} @compact={{true}} />`,
    descBlock: `<Nuvo::DescList @horizontal={{true}}>
  <div class="nu-desc-list__group">
    <dt class="nu-desc-list__term">Status</dt>
    <dd class="nu-desc-list__description"><Nuvo::Badge @variant="success" @text="Active" /></dd>
  </div>
</Nuvo::DescList>`,
  };

  listArgRows = [
    { name: '@items', type: 'array', default: '[]', description: 'Strings, or objects with label and optional icon. Ignored when a block is given.' },
    { name: '@ordered', type: 'boolean', default: 'false', description: 'Renders an ol instead of a ul.' },
    { name: '@plain', type: 'boolean', default: 'false', description: 'No list markers.' },
    { name: '@inline', type: 'boolean', default: 'false', description: 'Items flow on one line.' },
    { name: '@bordered', type: 'boolean', default: 'false', description: 'Divider between items.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Tighter item spacing.' },
  ];

  listBlockRows = [
    { name: 'default', description: 'Custom li elements carrying the nu-list__item class; replaces @items rendering.' },
  ];

  descArgRows = [
    { name: '@items', type: 'array', default: '[]', description: 'Objects with term and description. Ignored when a block is given.' },
    { name: '@horizontal', type: 'boolean', default: 'false', description: 'Term and description side by side.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Tighter group spacing.' },
  ];

  descBlockRows = [
    { name: 'default', description: 'Custom nu-desc-list__group elements with dt and dd children; replaces @items rendering.' },
  ];
}

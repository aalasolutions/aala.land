import Controller from '@ember/controller';

export default class WovenListController extends Controller {
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
    strings: `<Woven::List @items={{this.unitList}} />

// unitList: ['Marina Tower - Unit 1204', ...]`,
    icons: `<Woven::List @items={{this.iconList}} />

// iconList: [{ label: 'Parking bay', icon: '🅿' }, ...]`,
    ordered: `<Woven::List @items={{this.unitList}} @ordered={{true}} />`,
    divided: `<Woven::List @items={{this.unitList}} class="divided" />`,
    compact: `<Woven::List @items={{this.unitList}} @compact={{true}} />`,
    block: `<Woven::List class="divided">
  <li class="wu-list-item">
    <div class="wu-list-body">
      <p class="wu-list-title">March rent</p>
      <p class="wu-list-text">Unit 1204, AED 8,500</p>
    </div>
    <Woven::Tag @variant="success" @text="Paid" />
  </li>
  <li class="wu-list-item">
    <div class="wu-list-body">
      <p class="wu-list-title">April rent</p>
      <p class="wu-list-text">Unit 1204, AED 8,500</p>
    </div>
    <Woven::Tag @variant="warning" @text="Due" />
  </li>
</Woven::List>`,
    desc: `<Woven::DescList @items={{this.leaseDescItems}} />

// leaseDescItems: [{ term: 'Tenant', description: 'Ahmed Al Farsi' }, ...]`,
    descHorizontal: `<Woven::DescList @items={{this.leaseDescItems}} @horizontal={{true}} />`,
    descBordered: `<Woven::DescList @items={{this.leaseDescItems}} class="bordered" />`,
    descColumns: `<Woven::DescList @items={{this.leaseDescItems}} class="columns" />`,
    descBlock: `<Woven::DescList @horizontal={{true}} class="divided">
  <div>
    <dt>Status</dt>
    <dd><Woven::Tag @variant="success" @text="Active" /></dd>
  </div>
</Woven::DescList>`,
  };

  listArgRows = [
    { name: '@items', type: 'array', default: '[]', description: 'Strings, or objects with label and optional icon; each renders a wu-list-item with a wu-list-title. Ignored when a block is given.' },
    { name: '@ordered', type: 'boolean', default: 'false', description: 'Renders an ol instead of a ul. Both carry role="list" and no markers.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Kit sm modifier: tighter row padding.' },
  ];

  listBlockRows = [
    { name: 'default', description: 'Custom li elements with the kit wu-list-item, wu-list-body, wu-list-title and wu-list-text parts; replaces @items rendering.' },
  ];

  descArgRows = [
    { name: '@items', type: 'array', default: '[]', description: 'Objects with term and description, each in its own div. Ignored when a block is given.' },
    { name: '@horizontal', type: 'boolean', default: 'false', description: 'Kit horizontal modifier: terms in a column beside their descriptions.' },
  ];

  classRows = [
    { name: 'wu-list divided', description: 'Line between list rows.' },
    { name: 'wu-desc-list divided', description: 'Lines between the term and description pairs.' },
    { name: 'wu-desc-list bordered', description: 'Table look: lines around every cell, terms on the alternate background.' },
    { name: 'wu-desc-list columns', description: 'Several pairs per row.' },
  ];

  descBlockRows = [
    { name: 'default', description: 'Custom div elements with dt and dd children; replaces @items rendering.' },
  ];
}

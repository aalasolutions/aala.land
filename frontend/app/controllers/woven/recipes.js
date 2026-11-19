import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import CellText from '@wovenui/ember/components/woven/cell/text';
import CellLink from '@wovenui/ember/components/woven/cell/link';
import CellPerson from '@wovenui/ember/components/woven/cell/person';
import CellNumber from '@wovenui/ember/components/woven/cell/number';
import CellTag from '@wovenui/ember/components/woven/cell/tag';
import CellStatus from 'land/components/cell/status';
import CellMoney from 'land/components/cell/money';
import CellDate from 'land/components/cell/date';

const ROWS = [
  {
    id: '1',
    reference: 'L-1001',
    tenant: 'Test User',
    unit: 'Unit 101',
    typeLabel: 'Residential',
    status: 'ACTIVE',
    rent: 8500000,
    currency: 'AED',
    area: 1250,
    startDate: '2026-01-15',
  },
  {
    id: '2',
    reference: 'L-1002',
    tenant: 'Sample Tenant',
    unit: 'Unit 102',
    typeLabel: 'Residential',
    status: 'DRAFT',
    rent: 7200000,
    currency: 'AED',
    area: 980,
    startDate: '2026-02-01',
  },
  {
    id: '3',
    reference: 'L-1003',
    tenant: 'Demo Company LLC',
    unit: 'Shop 3',
    typeLabel: 'Commercial',
    status: 'ACTIVE',
    rent: 24000000,
    currency: 'AED',
    area: 2400,
    startDate: '2025-11-01',
  },
  {
    id: '4',
    reference: 'L-1004',
    tenant: null,
    unit: 'Unit 204',
    typeLabel: 'Residential',
    status: 'EXPIRED',
    rent: 6400000,
    currency: 'AED',
    area: 860,
    startDate: '2025-03-10',
  },
  {
    id: '5',
    reference: 'L-1005',
    tenant: 'Test User Two',
    unit: '',
    typeLabel: 'Residential',
    status: 'RENEWED',
    rent: 9100000,
    currency: 'AED',
    area: 1310,
    startDate: '2026-04-01',
  },
  {
    id: '6',
    reference: 'L-1006',
    tenant: 'Sample Tenant Two',
    unit: 'Office 7',
    typeLabel: 'Commercial',
    status: 'TERMINATED',
    rent: 15500000,
    currency: 'SAR',
    area: null,
    startDate: '2025-06-20',
  },
  {
    id: '7',
    reference: 'L-1007',
    tenant: 'Demo Tenant',
    unit: 'Unit 305',
    typeLabel: null,
    status: 'ACTIVE',
    rent: null,
    currency: 'AED',
    area: 1100,
    startDate: null,
  },
  {
    id: '8',
    reference: 'L-1008',
    tenant: 'Test User Three',
    unit: 'Unit 306',
    typeLabel: 'Residential',
    status: null,
    rent: 8800000,
    currency: 'AED',
    area: 1180,
    startDate: '2026-07-01',
  },
  {
    id: '9',
    reference: 'L-1009',
    tenant: 'Example Holdings',
    unit: 'Shop 9',
    typeLabel: 'Commercial',
    status: 'ACTIVE',
    rent: 31000000,
    currency: 'AED',
    area: 3050,
    startDate: '2026-09-15',
  },
  {
    id: '10',
    reference: 'L-1010',
    tenant: 'Sample Tenant Three',
    unit: 'Unit 410',
    typeLabel: 'Residential',
    status: 'DRAFT',
    rent: 7600000,
    currency: 'AED',
    area: 1020,
    startDate: '2026-11-01',
  },
];

export default class WovenRecipesController extends Controller {
  @tracked countState = 'unfiltered';
  @tracked activeTab = 'all';
  @tracked statusFilter = 'all';
  @tracked search = '';
  @tracked sort = 'newest';

  countStates = [
    { id: 'unfiltered', label: 'Unfiltered' },
    { id: 'filtered', label: 'Filtered' },
    { id: 'filtered-equal', label: 'Filtered, equal' },
    { id: 'empty', label: 'Empty' },
  ];

  tabs = [
    { id: 'all', label: 'All', count: 10 },
    { id: 'mine', label: 'Mine', count: 4 },
    { id: 'archived', label: 'Archived', count: 0 },
  ];

  statusOptions = [
    { id: 'all', label: 'All', count: 10 },
    { id: 'active', label: 'Active', count: 4 },
    { id: 'draft', label: 'Draft', count: 2 },
  ];

  sortOptions = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'rent', label: 'Highest rent' },
  ];

  columns = [
    {
      name: 'Reference',
      valuePath: 'reference',
      width: 120,
      isFixed: 'left',
      cell: CellLink,
      cellArgs: { route: 'woven.recipes.record' },
      stackedLabel: false,
    },
    { name: 'Tenant', valuePath: 'tenant', width: 200, cell: CellPerson },
    { name: 'Unit', valuePath: 'unit', width: 120, cell: CellText },
    {
      name: 'Type',
      valuePath: 'typeLabel',
      width: 130,
      cell: CellTag,
      cellArgs: { variant: 'info' },
    },
    {
      name: 'Status',
      valuePath: 'status',
      width: 130,
      cell: CellStatus,
      cellArgs: { domain: 'lease' },
    },
    {
      name: 'Rent',
      valuePath: 'rent',
      width: 130,
      numeric: true,
      cell: CellMoney,
      cellArgs: { currencyPath: 'currency', minor: true },
    },
    {
      name: 'Area (sq ft)',
      valuePath: 'area',
      width: 120,
      numeric: true,
      cell: CellNumber,
    },
    { name: 'Start', valuePath: 'startDate', width: 130, cell: CellDate },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isSortable: false,
      isResizable: false,
    },
  ];

  minimalColumns = [
    { name: 'Vendor', valuePath: 'name', width: 220, cell: CellText },
    { name: 'Contact', valuePath: 'contact', width: 200, cell: CellPerson },
    {
      name: 'Open orders',
      valuePath: 'openOrders',
      width: 140,
      numeric: true,
      cell: CellNumber,
    },
  ];

  minimalRows = [
    {
      id: 'v1',
      name: 'Sample Plumbing Co',
      contact: 'Test User',
      openOrders: 3,
    },
    { id: 'v2', name: 'Demo Electrical', contact: null, openOrders: 0 },
    {
      id: 'v3',
      name: 'Example Cooling',
      contact: 'Sample Contact',
      openOrders: 12,
    },
  ];

  crumbs = [{ label: 'Page recipes', route: 'woven.recipes' }];

  get isFiltered() {
    return (
      this.countState === 'filtered' ||
      this.countState === 'filtered-equal' ||
      this.countState === 'empty'
    );
  }

  get rows() {
    if (this.countState === 'empty') return [];
    if (this.countState === 'filtered') return ROWS.slice(0, 4);
    return ROWS;
  }

  get count() {
    return this.rows.length;
  }

  @action
  setCountState(state) {
    this.countState = state;
  }

  @action
  setTab(id) {
    this.activeTab = id;
  }

  @action
  setStatusFilter(id) {
    this.statusFilter = id;
  }

  @action
  setSearch(value) {
    this.search = value;
  }

  @action
  setSort(value) {
    this.sort = value;
  }

  code = {
    listPage: `<Woven::ListPage
  @title="Leases"
  @subtitle="Every lease in the active region."
  @count={{this.count}}
  @total={{10}}
  @filtered={{this.isFiltered}}
  @noun="item"
  @nounPlural="items"
  @isEmpty={{not this.rows.length}}
>
  <:action>
    <Woven::Button @variant="brand" @icon="plus" @text="New Lease" />
  </:action>

  <:switcher>
    <Woven::Tabs @tabs={{this.tabs}} @activeTab={{this.activeTab}} @onChange={{this.setTab}} />
  </:switcher>

  <:toolbar>
    <Woven::Segmented @options={{this.statusOptions}} @value={{this.statusFilter}} @onChange={{this.setStatusFilter}} />
    <div class="w-64">
      <Woven::Input type="search" aria-label="Search leases" @value={{this.search}} @onInput={{this.setSearch}} />
    </div>
    <FiltersButton @count={{1}}>...</FiltersButton>
  </:toolbar>

  <:toolbarEnd>
    <Woven::Dropdown @align="end" @options={{this.sortOptions}} @value={{this.sort}} @onSelect={{this.setSort}} />
  </:toolbarEnd>

  <:body as |page|>
    <Woven::DataTable
      @columns={{this.columns}}
      @rows={{this.rows}}
      @pinColumns={{true}}
      @sortable={{true}}
      @showOptions={{true}}
      @optionsTarget={{page.optionsTarget}}
      class="table-stacked"
      as |cell|
    >
      {{#if (eq cell.key "id")}}
        <div class="table-stacked__actions">
          <RowActions @label="lease {{cell.row.reference}}" @actions={{this.rowActions}} />
        </div>
      {{/if}}
    </Woven::DataTable>
  </:body>

  <:empty>
    <Woven::EmptyState @description="No leases match these filters." />
  </:empty>

  <:footer as |page|>
    <page.Pager @page={{1}} @limit={{50}} @total={{this.count}} />
  </:footer>
</Woven::ListPage>`,
    columns: `import CellLink from '@wovenui/ember/components/woven/cell/link';
import CellStatus from 'land/components/cell/status';
import CellMoney from 'land/components/cell/money';

columns = [
  { name: 'Reference', valuePath: 'reference', isFixed: 'left', cell: CellLink, cellArgs: { route: 'woven.recipes.record' }, stackedLabel: false },
  { name: 'Tenant', valuePath: 'tenant', cell: CellPerson },
  { name: 'Unit', valuePath: 'unit', cell: CellText },
  { name: 'Type', valuePath: 'typeLabel', cell: CellTag, cellArgs: { variant: 'info' } },
  { name: 'Status', valuePath: 'status', cell: CellStatus, cellArgs: { domain: 'lease' } },
  { name: 'Rent', valuePath: 'rent', numeric: true, cell: CellMoney, cellArgs: { currencyPath: 'currency', minor: true } },
  { name: 'Area (sq ft)', valuePath: 'area', numeric: true, cell: CellNumber },
  { name: 'Start', valuePath: 'startDate', cell: CellDate },
  { name: 'Actions', valuePath: 'id', isSortable: false },
];`,
    minimal: `<Woven::ListPage @title="Vendors" @count={{3}} @noun="vendor" @nounPlural="vendors">
  <:body as |page|>
    <Woven::DataTable
      @columns={{this.minimalColumns}}
      @rows={{this.minimalRows}}
      @showOptions={{true}}
      @optionsTarget={{page.optionsTarget}}
    />
  </:body>
</Woven::ListPage>`,
    detail: `<Woven::DetailPage
  @crumbs={{array (hash label="Leases" route="leases.index")}}
  @title="Unit 101, Sample Tower"
  @subtitle="Lease L-1001"
>
  <:meta>
    <Woven::Tag @variant={{tag-variant "lease" "ACTIVE"}} @text={{tag-label "lease" "ACTIVE"}} />
    <Woven::Tag @variant={{tag-variant "lease" "RESIDENTIAL"}} @text={{tag-label "lease" "RESIDENTIAL"}} />
  </:meta>
  <:actions>
    <Woven::Button @variant="subtle" @icon="pencil-simple" @text="Edit" />
    <Woven::Button @variant="brand" @text="Renew" />
  </:actions>
  <:body>
    <Woven::Card @title="Summary">...</Woven::Card>
    <Woven::Card @title="Payments">...</Woven::Card>
  </:body>
</Woven::DetailPage>`,
    detailFallback: `<Woven::DetailPage
  @crumbs={{array (hash label="Contacts" route="contacts.index")}}
  @title={{this.contact.name}}
  @titleFallback="Unnamed contact"
>
  <:body>...</:body>
</Woven::DetailPage>`,
  };

  rowActions = [
    { key: 'view', label: 'View', icon: 'file-text', onSelect: () => {} },
    {
      key: 'history',
      label: 'History',
      icon: 'clock-counter-clockwise',
      onSelect: () => {},
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'trash',
      variant: 'danger',
      onSelect: () => {},
    },
  ];
}

import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const COMPANIES = ['Emaar Properties', 'Damac', 'Nakheel', 'Sobha Realty'];

function makeRows() {
  return [
    { id: 'c-1', displayName: 'Ahmed Khalid', role: 'owner', email: 'ahmed@example.com', phone: '+971 50 111 2233', company: { name: 'Emaar Properties' }, units: 3, tags: ['owner', 'lead'] },
    { id: 'c-2', displayName: 'Sara Al Farsi', role: 'tenant', email: 'sara@example.com', phone: '+971 50 222 3344', company: { name: 'Damac' }, units: 1, tags: ['tenant'] },
    { id: 'c-3', displayName: 'Omar Haddad', role: 'lead', email: 'omar@example.com', phone: '+971 50 333 4455', company: { name: 'Nakheel' }, units: 0, tags: ['lead'] },
    { id: 'c-4', displayName: 'Layla Mansour', role: 'owner', email: 'layla@example.com', phone: '+971 50 444 5566', company: { name: 'Sobha Realty' }, units: 5, tags: ['owner'] },
  ];
}

export default class NuvoTableController extends Controller {
  @tracked rows = makeRows();
  @tracked selection = [];
  @tracked clickedRow = 'none yet';
  @tracked lastSort = 'none';
  @tracked lastEdit = 'none yet';
  @tracked page = 1;
  @tracked limit = 50;
  @tracked showRaw = true;

  total = 430;

  // Plain columns: the yield block decides how each cell renders.
  basicColumns = [
    { name: 'Name', valuePath: 'displayName', width: 200 },
    { name: 'Role', valuePath: 'role', width: 120 },
    { name: 'Email', valuePath: 'email', width: 220 },
    { name: 'Company', valuePath: 'company.name', width: 180 },
    { name: 'Units', valuePath: 'units', width: 90 },
  ];

  // Pinned first and last columns, an unsortable actions column, a minimum width.
  pinnedColumns = [
    { name: 'Name', valuePath: 'displayName', width: 220, isFixed: 'left' },
    { name: 'Role', valuePath: 'role', width: 140, minWidth: 100 },
    { name: 'Email', valuePath: 'email', width: 260 },
    { name: 'Phone', valuePath: 'phone', width: 200 },
    { name: 'Company', valuePath: 'company.name', width: 220 },
    { name: 'Units', valuePath: 'units', width: 100 },
    { name: 'Actions', valuePath: 'id', width: 110, isFixed: 'right', isSortable: false },
  ];

  // Every editor type in one table.
  editableColumns = [
    { name: 'Name', valuePath: 'displayName', width: 200, editable: 'text' },
    { name: 'Units', valuePath: 'units', width: 100, editable: 'number' },
    { name: 'Company', valuePath: 'companyName', width: 200, editable: 'select', options: COMPANIES },
    { name: 'Owner', valuePath: 'owner', width: 220, editable: 'search', searchUrl: '/contacts', searchParam: 'search', labelKey: 'displayName' },
  ];

  @tracked editableRows = [
    { id: 'e-1', displayName: 'Marina Tower', units: 42, companyName: 'Emaar Properties', owner: { displayName: 'Ahmed Khalid' } },
    { id: 'e-2', displayName: 'Burj Views', units: 18, companyName: 'Damac', owner: '' },
    { id: 'e-3', displayName: 'JVC Residence', units: 60, companyName: 'Nakheel', owner: { displayName: 'Layla Mansour' } },
  ];

  treeColumns = [
    { name: 'Property', valuePath: 'name', width: 260 },
    { name: 'Type', valuePath: 'type', width: 140 },
    { name: 'Rent (AED)', valuePath: 'rent', width: 140 },
  ];

  treeRows = [
    {
      id: 'p-1',
      name: 'Marina Tower',
      type: 'Building',
      rent: 350000,
      children: [
        { id: 'p-1-a', name: 'Unit 204', type: 'Apartment', rent: 102000 },
        { id: 'p-1-b', name: 'Unit 512', type: 'Apartment', rent: 134400 },
      ],
    },
    {
      id: 'p-2',
      name: 'JVC Residence',
      type: 'Building',
      rent: 82800,
      isCollapsed: true,
      children: [{ id: 'p-2-a', name: 'Unit 118', type: 'Apartment', rent: 82800 }],
    },
    { id: 'p-3', name: 'Downtown Loft', type: 'Villa', rent: 117600 },
  ];

  rtlColumns = [
    { name: 'الاسم', valuePath: 'displayName', width: 200, isFixed: 'left' },
    { name: 'البريد', valuePath: 'email', width: 220 },
    { name: 'الهاتف', valuePath: 'phone', width: 180 },
    { name: 'الشركة', valuePath: 'company.name', width: 200 },
  ];

  rtlRows = [
    { id: 'r-1', displayName: 'أحمد بن سعيد', email: 'ahmed@example.com', phone: '+966 50 111 2233', company: { name: 'شركة الرشيدي للعقارات' } },
    { id: 'r-2', displayName: 'فاطمة عبد الله', email: 'fatima@example.com', phone: '+966 50 222 3344', company: { name: 'مؤسسة النور' } },
  ];

  get selectionSummary() {
    return this.selection.length
      ? this.selection.map((row) => row.displayName).join(', ')
      : 'none';
  }

  @action
  setSelection(selection) {
    this.selection = selection;
  }

  @action
  noteRowClick(row) {
    this.clickedRow = row.displayName;
  }

  @action
  noteSort(sorts) {
    this.lastSort = sorts.length
      ? sorts.map((s) => `${s.valuePath} ${s.isAscending ? 'asc' : 'desc'}`).join(', ')
      : 'cleared';
  }

  // Search editors hand back the picked record; keep what the cell displays.
  @action
  saveCell(row, key, value) {
    this.editableRows = this.editableRows.map((item) =>
      item.id === row.id ? { ...item, [key]: value } : item,
    );
    const shown = value && typeof value === 'object' ? value.displayName : value;
    this.lastEdit = `${row.displayName}.${key} = ${shown ?? 'null'}`;
  }

  @action
  setPage(page) {
    this.page = page;
  }

  @action
  setLimit(limit) {
    this.limit = limit;
    this.page = 1;
  }

  code = {
    basic: `<DataTable @columns={{this.basicColumns}} @rows={{this.rows}} as |cell|>
  {{#if (eq cell.key "role")}}
    <Nuvo::Badge @variant="info" @text={{cell.value}} />
  {{else}}
    {{cell.value}}
  {{/if}}
</DataTable>

// basicColumns: [{ name: 'Name', valuePath: 'displayName', width: 200 }, ..., { name: 'Company', valuePath: 'company.name', width: 180 }]
// rows: [{ id: 'c-1', displayName: 'Ahmed Khalid', role: 'owner', company: { name: 'Emaar Properties' }, ... }]`,
    yieldBlock: `<DataTable @columns={{this.basicColumns}} @rows={{this.rows}} as |cell|>
  {{#if (eq cell.key "displayName")}}
    <LinkTo @route="contacts.detail" @model={{cell.row.id}}>{{cell.value}}</LinkTo>
  {{else if (eq cell.key "tags")}}
    <div class="data-table__chips">
      {{#each cell.row.tags as |tag|}}<Nuvo::Tag @size="sm" @text={{tag}} />{{/each}}
    </div>
  {{else}}
    <span class="text-muted">{{cell.value}}</span>
  {{/if}}
</DataTable>`,
    pinned: `<DataTable @columns={{this.pinnedColumns}} @rows={{this.rows}} @pinColumns={{true}} as |cell|>
  {{#if (eq cell.key "id")}}
    <Nuvo::Button @variant="secondary" @size="xs" @icon="pencil-simple" @text="Edit" />
  {{else}}
    {{cell.value}}
  {{/if}}
</DataTable>

// pinnedColumns: first column isFixed: 'left', Actions column isFixed: 'right', isSortable: false`,
    reorderable: `<DataTable @columns={{this.pinnedColumns}} @rows={{this.rows}} @pinColumns={{true}} @reorderable={{true}} as |cell|>
  {{cell.value}}
</DataTable>`,
    sortable: `<DataTable @columns={{this.basicColumns}} @rows={{this.rows}} @sortable={{true}} @onSort={{this.noteSort}} as |cell|>
  {{cell.value}}
</DataTable>

// noteSort(sorts) receives [{ valuePath, isAscending }] or [] when cleared`,
    options: `<DataTable @columns={{this.pinnedColumns}} @rows={{this.rows}} @pinColumns={{true}} @showOptions={{true}} as |cell|>
  {{cell.value}}
</DataTable>`,
    tableId: `<DataTable
  @columns={{this.pinnedColumns}}
  @rows={{this.rows}}
  @pinColumns={{true}}
  @reorderable={{true}}
  @showOptions={{true}}
  @tableId="docs-demo"
  as |cell|
>
  {{cell.value}}
</DataTable>`,
    selection: `<DataTable
  @columns={{this.basicColumns}}
  @rows={{this.rows}}
  @selection={{this.selection}}
  @onSelect={{this.setSelection}}
  as |cell|
>
  {{cell.value}}
</DataTable>`,
    rowClickSelect: `<DataTable
  @columns={{this.basicColumns}}
  @rows={{this.rows}}
  @selection={{this.selection}}
  @onSelect={{this.setSelection}}
  @selectOnRowClick={{true}}
  as |cell|
>
  {{cell.value}}
</DataTable>`,
    rowClick: `<DataTable @columns={{this.basicColumns}} @rows={{this.rows}} @onRowClick={{this.noteRowClick}} as |cell|>
  {{cell.value}}
</DataTable>

// noteRowClick(row, event)`,
    tree: `<DataTable @columns={{this.treeColumns}} @rows={{this.treeRows}} @tree={{true}} as |cell|>
  {{#if (eq cell.key "name")}}
    {{cell.value}}
    {{#if cell.hasChildren}}
      <Nuvo::Badge @size="sm" @text={{if cell.isCollapsed "collapsed" "open"}} />
    {{/if}}
  {{else}}
    {{cell.value}}
  {{/if}}
</DataTable>

// treeRows: [{ id, name, children: [{ id, name }, ...] }, { id, name, isCollapsed: true, children: [...] }, { id, name }]`,
    editing: `<DataTable @columns={{this.editableColumns}} @rows={{this.editableRows}} @onCellEdit={{this.saveCell}} as |cell|>
  {{#if (eq cell.key "owner")}}
    {{if cell.value.displayName cell.value.displayName cell.value}}
  {{else}}
    {{cell.value}}
  {{/if}}
</DataTable>

// editableColumns:
//   { name: 'Name',    valuePath: 'displayName', editable: 'text' }
//   { name: 'Units',   valuePath: 'units',       editable: 'number' }
//   { name: 'Company', valuePath: 'companyName', editable: 'select', options: ['Emaar Properties', 'Damac', ...] }
//   { name: 'Owner',   valuePath: 'owner',       editable: 'search', searchUrl: '/contacts', searchParam: 'search', labelKey: 'displayName' }
// saveCell(row, key, value): value is a string, a number (or null), an option value, or the picked record`,
    dir: `<DataTable @columns={{this.rtlColumns}} @rows={{this.rtlRows}} @pinColumns={{true}} @dir="rtl" as |cell|>
  {{cell.value}}
</DataTable>`,
    paged: `<DataTable @columns={{this.basicColumns}} @rows={{this.rows}} @sortable={{true}} @showOptions={{true}} @tableId="docs-paged" as |cell|>
  {{cell.value}}
</DataTable>

<Nuvo::Pagination
  @page={{this.page}}
  @limit={{this.limit}}
  @total={{this.total}}
  @onPageChange={{this.setPage}}
  @onLimitChange={{this.setLimit}}
/>`,
    raw: `<div class="nu-table-wrapper">
  <table class="nu-table m-striped">
    <thead>
      <tr>
        <th class="is-sortable is-sorted" aria-sort="ascending"><button type="button">Unit</button></th>
        <th class="m-align-end">Rent (AED)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="is-hoverable is-selected"><td>Unit 204</td><td class="m-align-end">8,500</td></tr>
      <tr class="nu-table__empty-row"><td colspan="2">No units match.</td></tr>
    </tbody>
    <tfoot>
      <tr><td>Total</td><td class="m-align-end">8,500</td></tr>
    </tfoot>
  </table>
</div>`,
  };

  argRows = [
    { name: '@columns', type: 'array', default: '[]', description: 'Column definitions; see the column shape below. A stable copy is kept per column because ember-table writes widths onto it.' },
    { name: '@rows', type: 'array', default: '[]', description: 'Row objects. Each needs a unique id: selection, editing and the row test hook match by id, not by identity.' },
    { name: '@pinColumns', type: 'boolean', default: 'false', description: 'Honours isFixed on columns. Without it every column scrolls.' },
    { name: '@reorderable', type: 'boolean', default: 'false', description: 'Drag headers to reorder. Pinned columns never move.' },
    { name: '@sortable', type: 'boolean', default: 'false', description: 'Click headers to sort on the loaded rows. Cycle: ascending, descending, cleared. Sorts the raw field, not the formatted text.' },
    { name: '@showOptions', type: 'boolean', default: 'false', description: 'Options button with a Columns menu to hide or show non-pinned columns, and Reset when @tableId is set.' },
    { name: '@tableId', type: 'string', default: '', description: 'Persists order, hidden columns and widths per user under table-{id} in the preferences service. Unknown keys are dropped and new columns appended on restore.' },
    { name: '@selection', type: 'array', default: '[]', description: 'Selected rows, matched by id.' },
    { name: '@selectOnRowClick', type: 'boolean', default: 'false', description: 'Clicking a row toggles it. Only with @onSelect, and switched off while the table is editable so single and double click do not compete.' },
    { name: '@tree', type: 'boolean', default: 'false', description: 'Rows with a children array nest; parents get a collapse caret. A row with isCollapsed: true starts closed.' },
    { name: '@dir', type: '"ltr" | "rtl"', default: 'html dir', description: 'Per-table direction override. RTL mirrors the column order and pinned sides; cell text reads RTL.' },
  ];

  callbackRows = [
    { name: '@onSelect', signature: '(rows)', description: 'Next selection after a checkbox or row toggle. Passing it adds the 48px checkbox column with a tri-state header.' },
    { name: '@onRowClick', signature: '(row, event)', description: 'Row clicked outside any control. Selection wins when @selectOnRowClick is also active.' },
    { name: '@onSort', signature: '(sorts)', description: 'Sort changed; sorts is [{ valuePath, isAscending }] or [] when cleared. Use it to sort on the server instead of the loaded rows.' },
    { name: '@onCellEdit', signature: '(row, key, value)', description: 'A cell commit. Passing it enables editing on columns that declare editable. Unchanged values are not reported.' },
  ];

  columnRows = [
    { name: 'name', type: 'string', default: '', description: 'Header text and the label in the Columns menu.' },
    { name: 'valuePath', type: 'string', default: '', description: 'Property read from the row; dotted paths such as company.name work. Also the cell.key in the block and the key in the layout store.' },
    { name: 'width', type: 'number', default: '', description: 'Initial width in px. User resizes are saved under @tableId.' },
    { name: 'minWidth', type: 'number', default: '', description: 'Lower bound for resizing.' },
    { name: 'isFixed', type: '"left" | "right"', default: '', description: 'Pins the column, only when @pinColumns is set. Pinned columns cannot be reordered or hidden; the sides swap under RTL.' },
    { name: 'isSortable', type: 'boolean', default: 'true', description: 'Set false to keep a column out of sorting (actions columns).' },
    { name: 'isResizable', type: 'boolean', default: 'true', description: 'Set false to lock the width.' },
    { name: 'editable', type: '"text" | "number" | "select" | "search"', default: '', description: 'Editor opened by double-click when @onCellEdit is set.' },
    { name: 'options', type: 'array', default: '', description: 'Choices for a select editor; strings or value/label objects.' },
    { name: 'searchUrl', type: 'string', default: '', description: 'Endpoint for a search editor (Nuvo::Autocomplete).' },
    { name: 'searchParam', type: 'string', default: '"q"', description: 'Query param for the search term.' },
    { name: 'labelKey', type: 'string', default: '"name"', description: 'Property of a search result, and of an object cell value, shown as the label.' },
  ];

  cellRows = [
    { name: 'cell.key', description: 'The column valuePath.' },
    { name: 'cell.value', description: 'The value read at valuePath.' },
    { name: 'cell.row', description: 'The whole row object.' },
    { name: 'cell.depth', description: 'Nesting depth in a tree table; 0 at the top level.' },
    { name: 'cell.hasChildren', description: 'True on a parent row that can collapse.' },
    { name: 'cell.isCollapsed', description: 'True while a parent row is collapsed.' },
  ];

  editingRows = [
    { name: 'Open', description: 'Double-click a cell whose column declares editable. The editor takes focus after one task so a filter input can open its menu on focus.' },
    { name: 'Commit', description: 'Text and number: Enter, Tab or blur. Select and search: picking an option commits at once.' },
    { name: 'Cancel', description: 'Escape. Blur also cancels a select or search editor that had no pick.' },
    { name: 'Tab', description: 'Walks to the next editable cell in reading order and continues on the next row; Shift+Tab walks back.' },
    { name: 'Numbers', description: 'An empty number commits null; a non-numeric draft is ignored.' },
    { name: 'Row click', description: 'Row-click selection is switched off while the table is editable.' },
  ];

  hookRows = [
    { name: 'data-test-data-table-row={id}', description: 'Every body row, keyed by the row id.' },
    { name: 'data-test-data-table-options', description: 'The Options button; data-test-data-table-columns wraps the toggles and data-test-data-table-column-toggle={key} marks each.' },
    { name: 'data-test-data-table-reset', description: 'Reset columns button.' },
    { name: 'data-test-data-table-select-all / -select-row', description: 'Header and row checkboxes.' },
    { name: 'data-test-data-table-editor={key}', description: 'The open cell editor wrapper.' },
  ];

  classRows = [
    { name: 'data-table__chips', description: 'Flex row with a small gap for tag or badge cells; children never shrink.' },
    { name: 'data-table-shell', description: 'Root wrapper carrying the resolved dir; the Options toolbar sits inside it.' },
    { name: 'data-table.nu-table-wrapper', description: 'The ember-table element, styled as the kit wrapper; its table extends nu-table.' },
    { name: 'data-table--rtl / --tree / --row-click', description: 'State classes for the mirrored layout, tree indent and pointer cursor.' },
    { name: 'tr.is-selected / tr.is-child', description: 'Selected row tint; nested row background in a tree.' },
  ];

  rawRows = [
    { name: 'nu-table-wrapper', description: 'Bordered, rounded scroll container. m-with-footer squares the bottom for an attached footer bar.' },
    { name: 'nu-table-wrapper__footer / __footer-status / __footer-controls', description: 'Bar under the wrapper for status text and pagination.' },
    { name: 'nu-table', description: 'Full-width table with collapsed borders; DataTable extends it.' },
    { name: 'nu-table.m-striped / m-bordered / m-compact / m-comfortable / m-sticky-head', description: 'Row stripes, vertical borders, density steps and a sticky header.' },
    { name: 'th.is-sortable / th.is-sorted', description: 'Sortable affordance and the sorted column highlight.' },
    { name: 'th.m-align-start / center / end, td.m-align-*', description: 'Logical cell alignment.' },
    { name: 'tr.is-hoverable / is-clickable / is-selected', description: 'Row hover, pointer cursor and the selected tint with an inline-start bar.' },
    { name: 'tr.nu-table__empty-row', description: 'Tall centred muted cell for the empty message.' },
  ];
}

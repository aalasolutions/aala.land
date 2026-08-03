import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { runTask } from 'ember-lifeline';
import { VARIANTS } from 'land/components/nuvo/-constants';

const THEMES = {
  teal: '#1ab5a5',
  indigo: '#4f46e5',
  rose: '#e11d48',
  amber: '#d97706',
};

export default class UikitController extends Controller {
  @tracked activeTheme = 'teal';
  @tracked loadingDemo = false;
  @tracked inputValue = 'Marina Tower';
  @tracked clearableValue = 'Clear me on hover';

  themes = Object.keys(THEMES);

  @action
  setTheme(name) {
    this.activeTheme = name;
    document.documentElement.style.setProperty('--primary', THEMES[name]);
  }

  @action
  toggleLoading() {
    this.loadingDemo = !this.loadingDemo;
  }

  @action
  updateInput(value) {
    this.inputValue = value;
  }

  @action
  updateClearable(value) {
    this.clearableValue = value;
  }

  @tracked textareaValue = 'Ground floor unit, sea view, needs minor touch-up before listing.';
  @tracked selectValue = 'dubai-marina';
  @tracked checkboxValue = true;
  @tracked indeterminateValue = false;
  @tracked radioValue = 'apartment';
  @tracked toggleValue = true;
  @tracked toggleWithTextValue = false;

  regionOptions = [
    { value: 'dubai-marina', label: 'Dubai Marina' },
    { value: 'downtown', label: 'Downtown Dubai' },
    { value: 'jvc', label: 'JVC' },
  ];

  propertyTypeOptions = ['Villa', 'Apartment', 'Townhouse'];

  variantOptions = VARIANTS;

  @action
  updateTextarea(value) {
    this.textareaValue = value;
  }

  @action
  updateSelect(value) {
    this.selectValue = value;
  }

  @action
  updateCheckbox(value) {
    this.checkboxValue = value;
  }

  @action
  updateRadio(value) {
    this.radioValue = value;
  }

  @action
  updateToggle(value) {
    this.toggleValue = value;
  }

  @action
  updateToggleWithText(value) {
    this.toggleWithTextValue = value;
  }

  @tracked groupInputValue = 'marina-tower';
  @tracked progressValue = 62;

  @action
  updateGroupInput(value) {
    this.groupInputValue = value;
  }

  @action
  bumpProgress() {
    this.progressValue = this.progressValue >= 100 ? 0 : this.progressValue + 10;
  }

  @tracked dropdownValue = 'downtown';
  @tracked actionResult = 'none yet';

  // Long enough to cross the 8-option search threshold.
  areaOptions = [
    { value: 'dubai-marina', label: 'Dubai Marina', group: 'Dubai' },
    { value: 'downtown', label: 'Downtown Dubai', group: 'Dubai' },
    { value: 'jbr', label: 'JBR', group: 'Dubai' },
    { value: 'jvc', label: 'JVC', group: 'Dubai' },
    { value: 'business-bay', label: 'Business Bay', group: 'Dubai' },
    { value: 'yas', label: 'Yas Island', group: 'Abu Dhabi' },
    { value: 'reem', label: 'Al Reem Island', group: 'Abu Dhabi' },
    { value: 'saadiyat', label: 'Saadiyat Island', group: 'Abu Dhabi' },
    { value: 'corniche', label: 'Corniche', group: 'Abu Dhabi' },
    { value: 'muraqqabat', label: 'Al Muraqqabat', group: 'Deira' },
  ];

  rowActions = [
    { value: 'edit', label: 'Edit', icon: '✎' },
    { value: 'duplicate', label: 'Duplicate', icon: '⧉' },
    { value: 'archive', label: 'Archive', icon: '⌸', disabled: true },
    { separator: true },
    { value: 'delete', label: 'Delete', icon: '✕', danger: true },
  ];

  @action
  updateDropdown(value) {
    this.dropdownValue = value;
  }

  @action
  runAction(value) {
    this.actionResult = value;
  }

  @tracked selectedUnitId = 'unit-204';

  units = [
    { id: 'unit-204', name: 'Unit 204, Marina Tower', tenant: 'Ahmed Khalid', rent: 'AED 8,500/mo' },
    { id: 'unit-512', name: 'Unit 512, Burj Views', tenant: 'Sara Al Farsi', rent: 'AED 11,200/mo' },
    { id: 'unit-118', name: 'Unit 118, JVC Residence', tenant: 'Vacant', rent: 'AED 6,900/mo' },
  ];

  @action
  selectUnit(id) {
    this.selectedUnitId = id;
  }

  @tracked alertDismissed = false;

  @action
  dismissAlert() {
    this.alertDismissed = true;
  }

  @action
  resetAlert() {
    this.alertDismissed = false;
  }

  unitList = [
    'Marina Tower - Unit 1204',
    'Downtown Loft - Unit 802',
    'JVC Residence - Unit 15A',
  ];

  leaseDescItems = [
    { term: 'Tenant', description: 'Ahmed Al Farsi' },
    { term: 'Unit', description: 'Marina Tower - 1204' },
    { term: 'Monthly Rent', description: 'AED 8,500' },
    { term: 'Lease Ends', description: '31 Dec 2026' },
  ];

  // ---- accordion ----

  accordionItems = [
    {
      id: 'unit-details',
      title: 'Unit Details',
      content: 'Unit 1204, Marina Tower - 2BR, sea view, 1,450 sqft.',
    },
    {
      id: 'lease-terms',
      title: 'Lease Terms',
      content: 'AED 8,500/month, 12-month term, renews 31 Dec 2026.',
    },
    {
      id: 'cheque-schedule',
      title: 'Cheque Schedule',
      content: '4 post-dated cheques, next due 1 Sep 2026.',
    },
    {
      id: 'maintenance-log',
      title: 'Maintenance Log',
      content: 'No open requests. Last service: AC, 12 Jun 2026.',
      disabled: true,
    },
  ];

  // ---- tabs ----

  @tracked activeUnitTab = 'overview';

  unitTabs = [
    { id: 'overview', label: 'Overview', icon: '▢' },
    { id: 'lease', label: 'Lease', icon: '📋', count: 1 },
    { id: 'cheques', label: 'Cheques', icon: '🏦', count: 4 },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧', disabled: true },
  ];

  @action
  updateUnitTab(tabId) {
    this.activeUnitTab = tabId;
  }

  // ---- segmented ----

  @tracked segmentedView = 'pipeline';
  @tracked segmentedPeriod = 'week';
  @tracked segmentedAmenities = ['parking', 'pool'];

  segmentedViews = [
    { id: 'pipeline', label: 'Pipeline', icon: 'squares-four' },
    { id: 'temperature', label: 'Temperature', icon: 'thermometer' },
    { id: 'agent', label: 'Agent', icon: 'users' },
    { id: 'list', label: 'List', icon: 'list' },
  ];

  segmentedPlain = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year', disabled: true },
  ];

  segmentedAmenityOptions = [
    { id: 'parking', label: 'Parking', icon: 'car' },
    { id: 'pool', label: 'Pool', icon: 'swimming-pool' },
    { id: 'gym', label: 'Gym', icon: 'barbell' },
    { id: 'security', label: 'Security', icon: 'shield-check' },
  ];

  @action
  updateSegmentedView(value) {
    this.segmentedView = value;
  }

  @action
  updateSegmentedPeriod(value) {
    this.segmentedPeriod = value;
  }

  @action
  updateSegmentedAmenities(values) {
    this.segmentedAmenities = values;
  }

  // ---- breadcrumb ----

  breadcrumbItems = [
    { label: 'Properties', href: '#' },
    { label: 'Marina Tower', href: '#' },
    { label: 'Unit 1204' },
  ];

  // ---- pagination ----

  @tracked paginationPage = 1;
  @tracked paginationPerPage = 10;
  paginationTotal = 87;
  paginationPerPageOptions = [10, 20, 50];

  @action
  updatePaginationPage(page) {
    this.paginationPage = page;
  }

  @action
  updatePaginationPerPage(perPage) {
    this.paginationPerPage = perPage;
    this.paginationPage = 1;
  }

  // ---- app shell ----

  @tracked sidebarCollapsed = false;
  @tracked sidebarOpen = false;
  @tracked activeSection = 'button';

  componentCount = 42;

  navSections = [
    {
      label: 'Atoms',
      items: [
        { id: 'button', label: 'Button', icon: '▭' },
        { id: 'badge', label: 'Badge', icon: '◉' },
        { id: 'tag', label: 'Tag', icon: '🏷' },
        { id: 'dot', label: 'Dot', icon: '•' },
        { id: 'avatar', label: 'Avatar', icon: '👤' },
        { id: 'spinner', label: 'Spinner', icon: '◌' },
        { id: 'divider', label: 'Divider', icon: '―' },
        { id: 'skeleton', label: 'Skeleton', icon: '░' },
      ],
    },
    {
      label: 'Forms',
      items: [
        { id: 'input', label: 'Input', icon: '▤' },
        { id: 'textarea', label: 'Textarea', icon: '▥' },
        { id: 'select', label: 'Select', icon: '▾' },
        { id: 'checkbox', label: 'Checkbox', icon: '☑' },
        { id: 'radio', label: 'Radio', icon: '◎' },
        { id: 'toggle', label: 'Toggle', icon: '⇄' },
        { id: 'field', label: 'Field', icon: '▣' },
        { id: 'input-group', label: 'Input group', icon: '⧉' },
        { id: 'form-actions', label: 'Form actions', icon: '⏎' },
      ],
    },
    {
      label: 'Containers',
      items: [
        { id: 'card', label: 'Card', icon: '▢' },
        { id: 'stat', label: 'Stat', icon: '📊' },
        { id: 'panel', label: 'Panel', icon: '▦' },
        { id: 'toolbar', label: 'Toolbar', icon: '⚙' },
        { id: 'list-item', label: 'List item', icon: '≡' },
        { id: 'info-row', label: 'Info row', icon: '⋮' },
        { id: 'list', label: 'List', icon: '☰' },
        { id: 'desc-list', label: 'Description list', icon: '📋' },
        { id: 'page-header', label: 'Page header', icon: '⌂' },
        { id: 'accordion', label: 'Accordion', icon: '▤' },
        { id: 'tabs', label: 'Tabs', icon: '▤' },
        { id: 'breadcrumb', label: 'Breadcrumb', icon: '▤' },
      ],
    },
    {
      label: 'Feedback',
      items: [
        { id: 'alert', label: 'Alert', icon: '⚠' },
        { id: 'progress', label: 'Progress', icon: '▰' },
        { id: 'empty-state', label: 'Empty state', icon: '∅' },
        { id: 'dropdown', label: 'Dropdown', icon: '▾' },
        { id: 'title-text', label: 'Typography', icon: 'A' },
        { id: 'pagination', label: 'Pagination', icon: '▤' },
        { id: 'modal', label: 'Modal', icon: '▢' },
        { id: 'confirm-modal', label: 'Confirm modal', icon: '◫' },
        { id: 'drawer', label: 'Drawer', icon: '▥' },
        { id: 'popover', label: 'Popover', icon: '◈' },
        { id: 'tooltip', label: 'Tooltip', icon: '◭' },
        { id: 'timeline', label: 'Timeline', icon: '⋮' },
      ],
    },
    {
      label: 'Foundations',
      items: [{ id: 'utilities', label: 'Utilities', icon: '⇥' }],
    },
  ];

  @action
  toggleCollapsed() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  @action
  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  @action
  closeSidebar() {
    this.sidebarOpen = false;
  }

  @action
  goToSection(id) {
    this.activeSection = id;
    this.sidebarOpen = false;
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }

  // ---- modal ----

  @tracked modalOpen = false;
  @tracked modalFullOpen = false;

  @action
  openModal() {
    this.modalOpen = true;
  }

  @action
  closeModal() {
    this.modalOpen = false;
  }

  @action
  openModalFull() {
    this.modalFullOpen = true;
  }

  @action
  closeModalFull() {
    this.modalFullOpen = false;
  }

  // ---- confirm modal ----

  @tracked confirmOpen = false;
  @tracked confirmDangerOpen = false;
  @tracked confirmBusyOpen = false;
  @tracked isConfirmingDemo = false;

  @action
  openConfirm() {
    this.confirmOpen = true;
  }

  @action
  closeConfirm() {
    this.confirmOpen = false;
  }

  @action
  openConfirmDanger() {
    this.confirmDangerOpen = true;
  }

  @action
  closeConfirmDanger() {
    this.confirmDangerOpen = false;
  }

  @action
  openConfirmBusy() {
    this.confirmBusyOpen = true;
  }

  @action
  closeConfirmBusy() {
    if (this.isConfirmingDemo) {
      return;
    }
    this.confirmBusyOpen = false;
  }

  @action
  runConfirmBusy() {
    if (this.isConfirmingDemo) {
      return;
    }
    this.isConfirmingDemo = true;
    runTask(
      this,
      () => {
        this.isConfirmingDemo = false;
        this.confirmBusyOpen = false;
      },
      1600,
    );
  }

  // ---- drawer ----

  @tracked drawerOpen = false;
  @tracked drawerPlacement = 'end';

  @action
  openDrawer(placement) {
    this.drawerPlacement = placement;
    this.drawerOpen = true;
  }

  @action
  closeDrawer() {
    this.drawerOpen = false;
  }

  // ---- popover ----

  @tracked popoverOpen = false;

  // Controlled mode needs BOTH directions. Without a toggle the popover could
  // only ever be closed, never opened.
  @action
  togglePopover() {
    this.popoverOpen = !this.popoverOpen;
  }

  @action
  closePopover() {
    this.popoverOpen = false;
  }

  // ---- selectable tags ----

  chipOptions = ['Parking', 'Pool', 'Gym', 'Balcony', 'Furnished'];
  @tracked selectedChips = ['Pool'];

  @action
  toggleChip(chip) {
    this.selectedChips = this.selectedChips.includes(chip)
      ? this.selectedChips.filter((c) => c !== chip)
      : [...this.selectedChips, chip];
  }

  // ---- filter row ----

  @tracked filterStatus = '';
  @tracked filterSearch = '';

  filterStatusOptions = [
    { value: '', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
  ];

  @action
  setFilterStatus(value) {
    this.filterStatus = value;
  }

  @action
  setFilterSearch(value) {
    this.filterSearch = value;
  }

  @action
  clearFilters() {
    this.filterStatus = '';
    this.filterSearch = '';
  }

  // ---- modal sizes ----

  @tracked sizedModal = null;

  modalSizes = ['sm', 'md', 'lg', 'xl', 'full'];

  @action
  openSizedModal(size) {
    this.sizedModal = size;
  }

  @action
  closeSizedModal() {
    this.sizedModal = null;
  }
}

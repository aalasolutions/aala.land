import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const THEMES = {
  teal: '#1ab5a5',
  indigo: '#4f46e5',
  rose: '#e11d48',
  amber: '#d97706',
};

// Shared documentation layout: navigation, theme switch, direction switch.
export default class NuvoController extends Controller {
  @tracked activeTheme = 'teal';
  @tracked dir = document.documentElement.dir || 'ltr';
  @tracked sidebarCollapsed = false;
  @tracked sidebarOpen = false;

  themes = Object.keys(THEMES);
  dirs = ['ltr', 'rtl'];

  navSections = [
    {
      label: 'Getting started',
      items: [
        { route: 'nuvo.index', label: 'Overview', icon: '⌂' },
        { route: 'nuvo.internals', label: 'Hosts and services', icon: '⚙' },
        { route: 'nuvo.shell', label: 'Shell', icon: '▣' },
        { route: 'nuvo.typography', label: 'Typography', icon: 'A' },
        { route: 'nuvo.utilities', label: 'Utilities', icon: '⇥' },
        { route: 'nuvo.table', label: 'Table', icon: '▦' },
        { route: 'nuvo.code', label: 'Code', icon: '‹›' },
      ],
    },
    {
      label: 'Atoms',
      items: [
        { route: 'nuvo.button', label: 'Button', icon: '▭' },
        { route: 'nuvo.badge', label: 'Badge', icon: '◉' },
        { route: 'nuvo.tag', label: 'Tag', icon: '🏷' },
        { route: 'nuvo.avatar', label: 'Avatar', icon: '👤' },
        { route: 'nuvo.indicators', label: 'Dot, Spinner, Skeleton', icon: '◌' },
        { route: 'nuvo.divider', label: 'Divider', icon: '―' },
      ],
    },
    {
      label: 'Forms',
      items: [
        { route: 'nuvo.input', label: 'Input, Textarea, Select', icon: '▤' },
        { route: 'nuvo.checkbox', label: 'Checkbox, Radio, Toggle', icon: '☑' },
        { route: 'nuvo.field', label: 'Field and layout', icon: '▣' },
      ],
    },
    {
      label: 'Containers',
      items: [
        { route: 'nuvo.card', label: 'Card and Stat', icon: '▢' },
        { route: 'nuvo.panel', label: 'Panel and Toolbar', icon: '▦' },
        { route: 'nuvo.list', label: 'List', icon: '☰' },
        { route: 'nuvo.page-header', label: 'Page header', icon: '⌂' },
        { route: 'nuvo.accordion', label: 'Accordion', icon: '▤' },
        { route: 'nuvo.tabs', label: 'Tabs', icon: '▤' },
        { route: 'nuvo.segmented', label: 'Segmented', icon: '⇄' },
        { route: 'nuvo.breadcrumb', label: 'Breadcrumb', icon: '›' },
        { route: 'nuvo.pagination', label: 'Pagination', icon: '⋯' },
      ],
    },
    {
      label: 'Feedback',
      items: [
        { route: 'nuvo.alert', label: 'Alert', icon: '⚠' },
        { route: 'nuvo.progress', label: 'Progress', icon: '▰' },
        { route: 'nuvo.empty-state', label: 'Empty state', icon: '∅' },
        { route: 'nuvo.timeline', label: 'Timeline', icon: '⋮' },
      ],
    },
    {
      label: 'Overlays',
      items: [
        { route: 'nuvo.dropdown', label: 'Dropdown', icon: '▾' },
        { route: 'nuvo.popover', label: 'Popover', icon: '◈' },
        { route: 'nuvo.tooltip', label: 'Tooltip', icon: '◭' },
        { route: 'nuvo.modal', label: 'Modal', icon: '▢' },
        { route: 'nuvo.confirm', label: 'Confirm dialog', icon: '◫' },
        { route: 'nuvo.drawer', label: 'Drawer', icon: '▥' },
      ],
    },
  ];

  get pageCount() {
    return this.navSections.reduce((sum, group) => sum + group.items.length, 0);
  }

  @action
  setTheme(name) {
    this.activeTheme = name;
    document.documentElement.style.setProperty('--primary', THEMES[name]);
  }

  @action
  setDir(dir) {
    this.dir = dir;
    document.documentElement.dir = dir;
  }

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
}

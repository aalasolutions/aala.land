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
export default class WovenController extends Controller {
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
        { route: 'woven.index', label: 'Overview', icon: '⌂' },
        { route: 'woven.internals', label: 'Hosts and services', icon: '⚙' },
        { route: 'woven.shell', label: 'Shell', icon: '▣' },
        { route: 'woven.typography', label: 'Typography', icon: 'A' },
        { route: 'woven.utilities', label: 'Utilities', icon: '⇥' },
        { route: 'woven.table', label: 'Table', icon: '▦' },
        { route: 'woven.code', label: 'Code', icon: '‹›' },
      ],
    },
    {
      label: 'Atoms',
      items: [
        { route: 'woven.button', label: 'Button', icon: '▭' },
        { route: 'woven.badge', label: 'Badge', icon: '◉' },
        { route: 'woven.tag', label: 'Tag', icon: '🏷' },
        { route: 'woven.avatar', label: 'Avatar', icon: '👤' },
        { route: 'woven.indicators', label: 'Dot, Spinner, Skeleton', icon: '◌' },
        { route: 'woven.divider', label: 'Divider', icon: '―' },
      ],
    },
    {
      label: 'Forms',
      items: [
        { route: 'woven.input', label: 'Input, Textarea, Select', icon: '▤' },
        { route: 'woven.checkbox', label: 'Checkbox, Radio, Toggle', icon: '☑' },
        { route: 'woven.field', label: 'Field and layout', icon: '▣' },
        { route: 'woven.form', label: 'Form', icon: '▤' },
      ],
    },
    {
      label: 'Containers',
      items: [
        { route: 'woven.card', label: 'Card and Stat', icon: '▢' },
        { route: 'woven.panel', label: 'Panel and Toolbar', icon: '▦' },
        { route: 'woven.list', label: 'List', icon: '☰' },
        { route: 'woven.page-header', label: 'Page header', icon: '⌂' },
        { route: 'woven.accordion', label: 'Accordion', icon: '▤' },
        { route: 'woven.tabs', label: 'Tabs', icon: '▤' },
        { route: 'woven.segmented', label: 'Segmented', icon: '⇄' },
        { route: 'woven.breadcrumb', label: 'Breadcrumb', icon: '›' },
        { route: 'woven.pagination', label: 'Pagination', icon: '⋯' },
      ],
    },
    {
      label: 'Feedback',
      items: [
        { route: 'woven.alert', label: 'Alert', icon: '⚠' },
        { route: 'woven.progress', label: 'Progress', icon: '▰' },
        { route: 'woven.empty-state', label: 'Empty state', icon: '∅' },
        { route: 'woven.timeline', label: 'Timeline', icon: '⋮' },
      ],
    },
    {
      label: 'Overlays',
      items: [
        { route: 'woven.dropdown', label: 'Dropdown', icon: '▾' },
        { route: 'woven.popover', label: 'Popover', icon: '◈' },
        { route: 'woven.tooltip', label: 'Tooltip', icon: '◭' },
        { route: 'woven.modal', label: 'Modal', icon: '▢' },
        { route: 'woven.confirm', label: 'Confirm dialog', icon: '◫' },
        { route: 'woven.drawer', label: 'Drawer', icon: '▥' },
      ],
    },
  ];

  get pageCount() {
    return this.navSections.reduce((sum, group) => sum + group.items.length, 0);
  }

  @action
  setTheme(name) {
    this.activeTheme = name;
    // Teal is the compiled default, so drop the override instead of pinning the seed hex.
    const { style } = document.documentElement;
    if (name === 'teal') {
      style.removeProperty('--wu-brand');
      style.removeProperty('--wu-brand-hover');
      style.removeProperty('--wu-brand-active');
    } else {
      style.setProperty('--wu-brand', THEMES[name]);
      // Approximates the core 800 and 900 stops so hover and active follow the demo colour.
      style.setProperty(
        '--wu-brand-hover',
        `color-mix(in oklch, ${THEMES[name]}, black 20%)`,
      );
      style.setProperty(
        '--wu-brand-active',
        `color-mix(in oklch, ${THEMES[name]}, black 35%)`,
      );
    }
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

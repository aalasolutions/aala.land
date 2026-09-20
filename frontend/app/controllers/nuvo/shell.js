import Controller, { inject as controller } from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class NuvoShellController extends Controller {
  // The docs layout owns the real sidebar; these actions drive it from the page.
  @controller('nuvo') layout;

  @tracked toggleCount = 0;

  @action
  countToggle() {
    this.toggleCount += 1;
  }

  @action
  collapseLayout() {
    this.layout.toggleCollapsed();
  }

  @action
  openLayoutMobile() {
    this.layout.toggleSidebar();
  }

  code = {
    sidebar: `<Nuvo::Sidebar @brandTitle="NuvoUI" @brandSubtitle="Ember kit">
  <div class="nu-sidebar__section-label">Atoms</div>
  <LinkTo @route="nuvo.button" class="nu-sidebar__link">
    <span class="nu-sidebar__link-icon" aria-hidden="true">▭</span>
    <span class="nu-sidebar__link-label">Button</span>
  </LinkTo>
</Nuvo::Sidebar>`,
    collapsed: `<Nuvo::Sidebar @collapsed={{this.sidebarCollapsed}} @brandTitle="NuvoUI">
  <LinkTo @route="nuvo.button" class="nu-sidebar__link" data-tooltip={{if this.sidebarCollapsed "Button"}} data-tooltip-position="end">
    <span class="nu-sidebar__link-icon" aria-hidden="true">▭</span>
    <span class="nu-sidebar__link-label">Button</span>
  </LinkTo>
</Nuvo::Sidebar>`,
    mobile: `<Nuvo::Sidebar @open={{this.sidebarOpen}} @dismissible={{true}} @onDismiss={{this.closeSidebar}} @brandTitle="NuvoUI">
  ...
</Nuvo::Sidebar>

<Nuvo::Topbar @onToggle={{this.toggleSidebar}} />`,
    brandBlock: `<Nuvo::Sidebar>
  <:brand>
    <img src="/logo.png" alt="AALA.LAND" width="36" height="36" />
    <p class="nu-sidebar__brand-title">AALA.LAND</p>
  </:brand>
  <:default>...</:default>
</Nuvo::Sidebar>`,
    footer: `<Nuvo::Sidebar @brandTitle="NuvoUI">
  <:default>...</:default>
  <:footer>
    <span class="nu-text m-xs m-subtle">35 pages</span>
  </:footer>
</Nuvo::Sidebar>`,
    link: `<Nuvo::SidebarLink @icon="▤" @label="Units" @active={{eq this.active "units"}} @onClick={{fn this.pick "units"}} />`,
    sublink: `<Nuvo::SidebarLink @icon="▥" @label="Leases" @sub={{true}} @onClick={{fn this.pick "leases"}} />`,
    linkBlock: `<Nuvo::SidebarLink @icon="▤" @onClick={{this.pick}}>
  Units <Nuvo::Badge @count={{true}} @variant="danger" @value={{3}} />
</Nuvo::SidebarLink>`,
    topbar: `<Nuvo::Topbar @onToggle={{this.toggleSidebar}} @userName="Test User" @userRole="Owner">
  <:brand>
    <span class="nu-title m-md">UI Kit</span>
  </:brand>
  <:actions>
    <Nuvo::Button @variant="secondary" @size="xs" @text="Action" />
  </:actions>
</Nuvo::Topbar>`,
    topbarBrandArg: `<Nuvo::Topbar @brand="AALA.LAND" />`,
    topbarSearch: `<Nuvo::Topbar @brand="AALA.LAND">
  <:search>
    <Nuvo::Input @size="sm" @prefixIcon="⌕" @placeholder="Search" />
  </:search>
  <:actions>
    <Nuvo::Button @variant="ghost" @shape="square" @icon="bell" aria-label="Notifications" />
  </:actions>
</Nuvo::Topbar>`,
    topbarUserBlock: `<Nuvo::Topbar @brand="AALA.LAND">
  <:actions></:actions>
  <:user>
    <Nuvo::Avatar @initials="TU" @size="sm" />
    <span class="nu-text m-sm">Test User</span>
  </:user>
</Nuvo::Topbar>`,
    topbarSticky: `<Nuvo::Topbar @sticky={{true}} @onToggle={{this.toggleSidebar}} @userName="Test User" @userRole="Owner" />`,
  };

  sidebarArgRows = [
    { name: '@collapsed', type: 'boolean', default: 'false', description: 'Collapses to an icon rail (is-collapsed). Labels hide; put the label in data-tooltip on each link.' },
    { name: '@open', type: 'boolean', default: 'false', description: 'Mobile: slides the sidebar in (is-open) and shows the backdrop.' },
    { name: '@dismissible', type: 'boolean', default: 'false', description: 'Renders a backdrop that calls @onDismiss when clicked.' },
    { name: '@brandTitle', type: 'string', default: '', description: 'Brand line when no brand block is given.' },
    { name: '@brandSubtitle', type: 'string', default: '', description: 'Second brand line.' },
  ];

  sidebarCallbackRows = [
    { name: '@onDismiss', signature: '()', description: 'Backdrop clicked while open.' },
  ];

  sidebarBlockRows = [
    { name: 'brand', description: 'Replaces the brand title and subtitle.' },
    { name: 'default', description: 'Navigation content inside nav.nu-sidebar__nav: section labels, links and groups. Explicit <:default> is required when another named block is used.' },
    { name: 'footer', description: 'Pinned to the bottom.' },
  ];

  linkArgRows = [
    { name: '@icon', type: 'string', default: '', description: 'Glyph before the label.' },
    { name: '@label', type: 'string', default: '', description: 'Label when no block is given.' },
    { name: '@active', type: 'boolean', default: 'false', description: 'Adds is-active. A LinkTo with the same class gets the equivalent active class from the router.' },
    { name: '@sub', type: 'boolean', default: 'false', description: 'Renders as nu-sidebar__sublink for items inside a group.' },
  ];

  linkCallbackRows = [
    { name: '@onClick', signature: '(event)', description: 'Button clicked.' },
  ];

  linkBlockRows = [
    { name: 'default', description: 'Label content; replaces @label.' },
  ];

  topbarArgRows = [
    { name: '@sticky', type: 'boolean', default: 'false', description: 'Sticks to the top of the scroll container.' },
    { name: '@brand', type: 'string', default: '', description: 'Brand text when no brand block is given.' },
    { name: '@userName', type: 'string', default: '', description: 'Renders the user block at the end when no user block is given.' },
    { name: '@userRole', type: 'string', default: '', description: 'Second line of the user block.' },
  ];

  topbarCallbackRows = [
    { name: '@onToggle', signature: '()', description: 'Passing it renders the hamburger button, which calls it.' },
  ];

  topbarBlockRows = [
    { name: 'brand', description: 'Leading content after the toggle.' },
    { name: 'search', description: 'Search control slot.' },
    { name: 'actions', description: 'Trailing controls. Always rendered.' },
    { name: 'user', description: 'Replaces the user name and role block.' },
  ];
}

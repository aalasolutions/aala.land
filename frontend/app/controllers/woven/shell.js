import Controller, { inject as controller } from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WovenShellController extends Controller {
  // The docs layout owns the real sidebar; these actions drive it from the page.
  @controller('woven') layout;

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
    sidebar: `<Woven::Sidebar @brandTitle="WovenUI" @brandSubtitle="Ember kit">
  <div class="wu-sidebar__section-label">Atoms</div>
  <LinkTo @route="woven.button" class="wu-sidebar__link">
    <span class="wu-sidebar__link-icon" aria-hidden="true">▭</span>
    <span class="wu-sidebar__link-label">Button</span>
  </LinkTo>
</Woven::Sidebar>`,
    collapsed: `<Woven::Sidebar @collapsed={{this.sidebarCollapsed}} @brandTitle="WovenUI">
  <LinkTo @route="woven.button" class="wu-sidebar__link" data-tooltip={{if this.sidebarCollapsed "Button"}} data-tooltip-position="end">
    <span class="wu-sidebar__link-icon" aria-hidden="true">▭</span>
    <span class="wu-sidebar__link-label">Button</span>
  </LinkTo>
</Woven::Sidebar>`,
    mobile: `<Woven::Sidebar @open={{this.sidebarOpen}} @dismissible={{true}} @onDismiss={{this.closeSidebar}} @brandTitle="WovenUI">
  ...
</Woven::Sidebar>

<Woven::Topbar @onToggle={{this.toggleSidebar}} />`,
    brandBlock: `<Woven::Sidebar>
  <:brand>
    <img src="/logo.png" alt="AALA.LAND" width="36" height="36" />
    <p class="wu-sidebar__brand-title">AALA.LAND</p>
  </:brand>
  <:default>...</:default>
</Woven::Sidebar>`,
    footer: `<Woven::Sidebar @brandTitle="WovenUI">
  <:default>...</:default>
  <:footer>
    <span class="wu-text m-xs m-subtle">35 pages</span>
  </:footer>
</Woven::Sidebar>`,
    link: `<Woven::SidebarLink @icon="▤" @label="Units" @active={{eq this.active "units"}} @onClick={{fn this.pick "units"}} />`,
    sublink: `<Woven::SidebarLink @icon="▥" @label="Leases" @sub={{true}} @onClick={{fn this.pick "leases"}} />`,
    linkBlock: `<Woven::SidebarLink @icon="▤" @onClick={{this.pick}}>
  Units <Woven::Badge @count={{true}} @variant="danger" @value={{3}} />
</Woven::SidebarLink>`,
    topbar: `<Woven::Topbar @onToggle={{this.toggleSidebar}} @userName="Test User" @userRole="Owner">
  <:brand>
    <span class="wu-title m-md">UI Kit</span>
  </:brand>
  <:actions>
    <Woven::Button @variant="secondary" @size="xs" @text="Action" />
  </:actions>
</Woven::Topbar>`,
    topbarBrandArg: `<Woven::Topbar @brand="AALA.LAND" />`,
    topbarSearch: `<Woven::Topbar @brand="AALA.LAND">
  <:search>
    <Woven::Input @size="sm" @prefixIcon="⌕" @placeholder="Search" />
  </:search>
  <:actions>
    <Woven::Button @variant="ghost" @shape="square" @icon="bell" aria-label="Notifications" />
  </:actions>
</Woven::Topbar>`,
    topbarUserBlock: `<Woven::Topbar @brand="AALA.LAND">
  <:actions></:actions>
  <:user>
    <Woven::Avatar @initials="TU" @size="sm" />
    <span class="wu-text m-sm">Test User</span>
  </:user>
</Woven::Topbar>`,
    topbarSticky: `<Woven::Topbar @sticky={{true}} @onToggle={{this.toggleSidebar}} @userName="Test User" @userRole="Owner" />`,
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
    { name: 'default', description: 'Navigation content inside nav.wu-sidebar__nav: section labels, links and groups. Explicit <:default> is required when another named block is used.' },
    { name: 'footer', description: 'Pinned to the bottom.' },
  ];

  linkArgRows = [
    { name: '@icon', type: 'string', default: '', description: 'Glyph before the label.' },
    { name: '@label', type: 'string', default: '', description: 'Label when no block is given.' },
    { name: '@active', type: 'boolean', default: 'false', description: 'Adds is-active. A LinkTo with the same class gets the equivalent active class from the router.' },
    { name: '@sub', type: 'boolean', default: 'false', description: 'Renders as wu-sidebar__sublink for items inside a group.' },
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

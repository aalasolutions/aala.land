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
    sidebar: `<Woven::Sidebar @pinned={{true}} @brandTitle="WovenUI" @brandSubtitle="Ember kit">
  <div class="wu-sidebar-section">
    <h2 class="wu-sidebar-heading">Atoms</h2>
    <ul class="wu-sidebar-list">
      <li>
        <LinkTo @route="woven.button" class="wu-sidebar-link" aria-current={{if (this.isCurrent "woven.button") "page"}}>
          <span aria-hidden="true">▭</span>
          <span class="wu-sidebar-label">Button</span>
        </LinkTo>
      </li>
    </ul>
  </div>
</Woven::Sidebar>`,
    collapsed: `<Woven::Sidebar @collapsed={{this.sidebarCollapsed}} @brandTitle="WovenUI">
  <ul class="wu-sidebar-list">
    <li>
      <LinkTo @route="woven.button" class="wu-sidebar-link">
        <span aria-hidden="true">▭</span>
        <span class="wu-sidebar-label">Button</span>
      </LinkTo>
    </li>
  </ul>
</Woven::Sidebar>`,
    mobile: `<Woven::Sidebar @open={{this.sidebarOpen}} @dismissible={{true}} @onDismiss={{this.closeSidebar}} @brandTitle="WovenUI">
  ...
</Woven::Sidebar>

<Woven::Topbar @onToggle={{this.toggleSidebar}} />`,
    brandBlock: `<Woven::Sidebar>
  <:brand>
    <img src="/logo.png" alt="AALA.LAND" width="36" height="36" />
    <span class="wu-title sm">AALA.LAND</span>
  </:brand>
  <:default>...</:default>
</Woven::Sidebar>`,
    footer: `<Woven::Sidebar @brandTitle="WovenUI">
  <:default>...</:default>
  <:footer>
    <span class="wu-text sm text-subtle">35 pages</span>
  </:footer>
</Woven::Sidebar>`,
    link: `<Woven::SidebarLink @icon="▤" @label="Units" @active={{eq this.active "units"}} @onClick={{fn this.pick "units"}} />`,
    sublink: `<li>
  <details class="wu-sidebar-group" open>
    <summary class="wu-sidebar-toggle">Properties</summary>
    <ul class="wu-sidebar-list">
      <li><Woven::SidebarLink @icon="▥" @label="Leases" @onClick={{fn this.pick "leases"}} /></li>
    </ul>
  </details>
</li>`,
    linkBlock: `<Woven::SidebarLink @icon="▤" @onClick={{this.pick}}>
  Units <Woven::Badge @count={{true}} @variant="danger" @value={{3}} />
</Woven::SidebarLink>`,
    topbar: `<Woven::Topbar @onToggle={{this.toggleSidebar}} @userName="Test User" @userRole="Owner">
  <:brand>
    <span class="wu-title sm">UI Kit</span>
  </:brand>
  <:actions>
    <Woven::Button @size="xs" @text="Action" />
  </:actions>
</Woven::Topbar>`,
    topbarBrandArg: `<Woven::Topbar @brand="AALA.LAND" />`,
    topbarSearch: `<Woven::Topbar @brand="AALA.LAND">
  <:search>
    <Woven::Input @size="sm" @prefixIcon="⌕" @placeholder="Search" aria-label="Search" />
  </:search>
  <:actions>
    <Woven::Button @variant="ghost" @shape="square" @icon="bell" aria-label="Notifications" />
  </:actions>
</Woven::Topbar>`,
    topbarUserBlock: `<Woven::Topbar @brand="AALA.LAND">
  <:actions></:actions>
  <:user>
    <Woven::Avatar @initials="TU" @size="sm" />
    <span class="wu-text sm">Test User</span>
  </:user>
</Woven::Topbar>`,
    topbarSticky: `<Woven::Topbar @sticky={{true}} @onToggle={{this.toggleSidebar}} @userName="Test User" @userRole="Owner" />`,
  };

  sidebarArgRows = [
    { name: '@collapsed', type: 'boolean', default: 'false', description: 'Kit collapsed modifier: an icon rail; labels show as tooltips.' },
    { name: '@pinned', type: 'boolean', default: 'false', description: 'Kit pinned modifier: sticks beside scrolling content and scrolls on its own.' },
    { name: '@animated', type: 'boolean', default: 'false', description: 'Kit animated modifier: animates the width and the chevron when motion is allowed.' },
    { name: '@open', type: 'boolean', default: 'false', description: 'With dismissible, below md: slides the sidebar in and shows the backdrop.' },
    { name: '@dismissible', type: 'boolean', default: 'false', description: 'Off-canvas below md, with a backdrop that calls @onDismiss when clicked.' },
    { name: '@label', type: 'string', default: '"Main"', description: 'aria-label of the nav.' },
    { name: '@brandTitle', type: 'string', default: '', description: 'Header title when no brand block is given.' },
    { name: '@brandSubtitle', type: 'string', default: '', description: 'Second header line.' },
  ];

  sidebarCallbackRows = [
    { name: '@onDismiss', signature: '()', description: 'Backdrop clicked while open.' },
  ];

  sidebarBlockRows = [
    { name: 'brand', description: 'Content of wu-sidebar-header; replaces the brand title and subtitle.' },
    { name: 'default', description: 'Navigation content: wu-sidebar-section, wu-sidebar-heading, wu-sidebar-list and groups. Explicit <:default> is required when another named block is used.' },
    { name: 'footer', description: 'Content of wu-sidebar-footer, pushed to the bottom.' },
  ];

  linkArgRows = [
    { name: '@icon', type: 'string', default: '', description: 'Glyph before the label.' },
    { name: '@label', type: 'string', default: '', description: 'Label when no block is given.' },
    { name: '@active', type: 'boolean', default: 'false', description: 'Sets aria-current="page", the kit current-link look.' },
  ];

  linkCallbackRows = [
    { name: '@onClick', signature: '(event)', description: 'Button clicked.' },
  ];

  linkBlockRows = [
    { name: 'default', description: 'Label content inside wu-sidebar-label; replaces @label.' },
  ];

  topbarArgRows = [
    { name: '@sticky', type: 'boolean', default: 'false', description: 'Kit pinned modifier: sticks to the top of the scroll container.' },
    { name: '@brand', type: 'string', default: '', description: 'Brand text (wu-topbar-brand) when no brand block is given.' },
    { name: '@userName', type: 'string', default: '', description: 'Renders the user block at the end when no user block is given.' },
    { name: '@userRole', type: 'string', default: '', description: 'Second line of the user block.' },
  ];

  topbarCallbackRows = [
    { name: '@onToggle', signature: '()', description: 'Passing it renders the hamburger button, shown below md, which calls it.' },
  ];

  topbarBlockRows = [
    { name: 'brand', description: 'Content of wu-topbar-brand, after the toggle.' },
    { name: 'search', description: 'Rendered unwrapped between the brand and the end group.' },
    { name: 'actions', description: 'Controls in wu-topbar-end. Always rendered.' },
    { name: 'user', description: 'Replaces the user name and role block, after a divider in the end group.' },
  ];
}

import Controller from '@ember/controller';

export default class WovenPanelController extends Controller {
  filler = Array.from({ length: 8 }, (_, index) => `Row ${index + 1} of scrolling content.`);

  code = {
    title: `<Woven::Panel @title="Property Filters">
  <p class="wu-text m-sm m-muted">Default padded panel with a title.</p>
</Woven::Panel>`,
    plain: `<Woven::Panel>
  <p class="wu-text m-sm m-muted">No title, no header: just the surface.</p>
</Woven::Panel>`,
    headerBlock: `<Woven::Panel>
  <:header>
    <Woven::Title @tag="h3" @size="sm" @text="Custom header" />
    <Woven::Badge @variant="info" @text="3" />
  </:header>
  <:body>Body content.</:body>
</Woven::Panel>`,
    slots: `<Woven::Panel @title="Unit Maintenance">
  <:body>
    <p class="wu-text m-sm m-muted">Named-block body/footer, same shape as card.</p>
  </:body>
  <:footer>
    <Woven::Button @variant="secondary" @size="sm" @text="Cancel" />
    <Woven::Button @variant="primary" @size="sm" @text="Save" />
  </:footer>
</Woven::Panel>`,
    compact: `<Woven::Panel @title="Compact" @compact={{true}}>...</Woven::Panel>`,
    raised: `<Woven::Panel @title="Raised" @raised={{true}}>...</Woven::Panel>`,
    interactive: `<Woven::Panel @title="Interactive" @interactive={{true}}>...</Woven::Panel>`,
    toolbar: `<Woven::Toolbar>
  <div class="wu-toolbar__group">
    <Woven::Button @variant="secondary" @size="sm" @text="All Units" />
    <Woven::Button @variant="ghost" @size="sm" @text="Occupied" />
  </div>
  <span class="wu-toolbar__spacer"></span>
  <Woven::Button @variant="primary" @size="sm" @text="Add Unit" />
</Woven::Toolbar>`,
    toolbarBordered: `<Woven::Toolbar @bordered={{true}}>
  <div class="wu-toolbar__group">
    <Woven::Button @variant="secondary" @size="sm" @text="All Units" />
    <Woven::Button @variant="ghost" @size="sm" @text="Occupied" />
    <Woven::Button @variant="ghost" @size="sm" @text="Vacant" />
  </div>
  <span class="wu-toolbar__spacer"></span>
  <div class="wu-toolbar__item">
    <Woven::Badge @variant="info" @text="184 units" />
  </div>
  <Woven::Button @variant="primary" @size="sm" @text="Add Unit" />
</Woven::Toolbar>`,
    toolbarSearch: `<Woven::Toolbar @bordered={{true}}>
  <div class="wu-toolbar__search">
    <Woven::Input @size="sm" @prefixIcon="⌕" @placeholder="Search units" />
  </div>
  <span class="wu-toolbar__spacer"></span>
  <Woven::Button @variant="secondary" @size="sm" @icon="funnel" @text="Filters" />
</Woven::Toolbar>`,
    toolbarSticky: `<div class="scroll-container">
  <Woven::Toolbar @sticky={{true}} @bordered={{true}}>...</Woven::Toolbar>
  ...long content...
</div>`,
  };

  panelArgRows = [
    { name: '@title', type: 'string', default: '', description: 'Header title. The header renders only when a title or header block is given.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Tighter padding.' },
    { name: '@raised', type: 'boolean', default: 'false', description: 'Elevated shadow.' },
    { name: '@interactive', type: 'boolean', default: 'false', description: 'Hover and focus affordance.' },
  ];

  panelBlockRows = [
    { name: 'header', description: 'Replaces the title header.' },
    { name: 'body', description: 'Body content. Takes precedence over the default block.' },
    { name: 'default', description: 'Body content when no named body block is given.' },
    { name: 'footer', description: 'Footer row.' },
  ];

  toolbarArgRows = [
    { name: '@sticky', type: 'boolean', default: 'false', description: 'Sticks to the top of its scroll container.' },
    { name: '@bordered', type: 'boolean', default: 'false', description: 'Bottom border separating the toolbar from content.' },
  ];

  toolbarClassRows = [
    { name: 'wu-toolbar__group', description: 'Tight cluster of related controls.' },
    { name: 'wu-toolbar__item', description: 'A single aligned item.' },
    { name: 'wu-toolbar__spacer', description: 'Flexible gap that pushes following items to the end. A bare span, not a component.' },
    { name: 'wu-toolbar__search', description: 'Wrapper that gives a search input its toolbar width.' },
  ];
}

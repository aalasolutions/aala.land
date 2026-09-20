import Controller from '@ember/controller';

export default class NuvoPanelController extends Controller {
  filler = Array.from({ length: 8 }, (_, index) => `Row ${index + 1} of scrolling content.`);

  code = {
    title: `<Nuvo::Panel @title="Property Filters">
  <p class="nu-text m-sm m-muted">Default padded panel with a title.</p>
</Nuvo::Panel>`,
    plain: `<Nuvo::Panel>
  <p class="nu-text m-sm m-muted">No title, no header: just the surface.</p>
</Nuvo::Panel>`,
    headerBlock: `<Nuvo::Panel>
  <:header>
    <Nuvo::Title @tag="h3" @size="sm" @text="Custom header" />
    <Nuvo::Badge @variant="info" @text="3" />
  </:header>
  <:body>Body content.</:body>
</Nuvo::Panel>`,
    slots: `<Nuvo::Panel @title="Unit Maintenance">
  <:body>
    <p class="nu-text m-sm m-muted">Named-block body/footer, same shape as card.</p>
  </:body>
  <:footer>
    <Nuvo::Button @variant="secondary" @size="sm" @text="Cancel" />
    <Nuvo::Button @variant="primary" @size="sm" @text="Save" />
  </:footer>
</Nuvo::Panel>`,
    compact: `<Nuvo::Panel @title="Compact" @compact={{true}}>...</Nuvo::Panel>`,
    raised: `<Nuvo::Panel @title="Raised" @raised={{true}}>...</Nuvo::Panel>`,
    interactive: `<Nuvo::Panel @title="Interactive" @interactive={{true}}>...</Nuvo::Panel>`,
    toolbar: `<Nuvo::Toolbar>
  <div class="nu-toolbar__group">
    <Nuvo::Button @variant="secondary" @size="sm" @text="All Units" />
    <Nuvo::Button @variant="ghost" @size="sm" @text="Occupied" />
  </div>
  <span class="nu-toolbar__spacer"></span>
  <Nuvo::Button @variant="primary" @size="sm" @text="Add Unit" />
</Nuvo::Toolbar>`,
    toolbarBordered: `<Nuvo::Toolbar @bordered={{true}}>
  <div class="nu-toolbar__group">
    <Nuvo::Button @variant="secondary" @size="sm" @text="All Units" />
    <Nuvo::Button @variant="ghost" @size="sm" @text="Occupied" />
    <Nuvo::Button @variant="ghost" @size="sm" @text="Vacant" />
  </div>
  <span class="nu-toolbar__spacer"></span>
  <div class="nu-toolbar__item">
    <Nuvo::Badge @variant="info" @text="184 units" />
  </div>
  <Nuvo::Button @variant="primary" @size="sm" @text="Add Unit" />
</Nuvo::Toolbar>`,
    toolbarSearch: `<Nuvo::Toolbar @bordered={{true}}>
  <div class="nu-toolbar__search">
    <Nuvo::Input @size="sm" @prefixIcon="⌕" @placeholder="Search units" />
  </div>
  <span class="nu-toolbar__spacer"></span>
  <Nuvo::Button @variant="secondary" @size="sm" @icon="funnel" @text="Filters" />
</Nuvo::Toolbar>`,
    toolbarSticky: `<div class="scroll-container">
  <Nuvo::Toolbar @sticky={{true}} @bordered={{true}}>...</Nuvo::Toolbar>
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
    { name: 'nu-toolbar__group', description: 'Tight cluster of related controls.' },
    { name: 'nu-toolbar__item', description: 'A single aligned item.' },
    { name: 'nu-toolbar__spacer', description: 'Flexible gap that pushes following items to the end. A bare span, not a component.' },
    { name: 'nu-toolbar__search', description: 'Wrapper that gives a search input its toolbar width.' },
  ];
}

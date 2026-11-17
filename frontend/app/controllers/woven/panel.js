import Controller from '@ember/controller';

export default class WovenPanelController extends Controller {
  code = {
    title: `<Woven::Panel @title="Property Filters">
  <p class="wu-text sm muted">Default padded panel with a title.</p>
</Woven::Panel>`,
    plain: `<Woven::Panel>
  <p class="wu-text sm muted">No title, no header: just the surface.</p>
</Woven::Panel>`,
    headerBlock: `<Woven::Panel>
  <:header>
    <h3 class="wu-panel-title">Custom header</h3>
    <Woven::Badge @variant="info" @value={{3}} />
  </:header>
  <:body>Body content.</:body>
</Woven::Panel>`,
    slots: `<Woven::Panel @title="Unit Maintenance">
  <:body>
    <p class="wu-text sm muted">Named-block body/footer, same shape as card.</p>
  </:body>
  <:footer>
    <Woven::Button @size="sm" @text="Cancel" />
    <Woven::Button @variant="brand" @size="sm" @text="Save" />
  </:footer>
</Woven::Panel>`,
    toolbar: `<Woven::Toolbar>
  <div class="wu-toolbar-group">
    <Woven::Button @size="sm" @text="All Units" />
    <Woven::Button @variant="ghost" @size="sm" @text="Occupied" />
  </div>
  <div class="wu-toolbar-end">
    <Woven::Button @variant="brand" @size="sm" @text="Add Unit" />
  </div>
</Woven::Toolbar>`,
    toolbarBordered: `<Woven::Toolbar @bordered={{true}}>
  <div class="wu-toolbar-group">
    <Woven::Button @size="sm" @text="All Units" />
    <Woven::Button @variant="ghost" @size="sm" @text="Occupied" />
    <Woven::Button @variant="ghost" @size="sm" @text="Vacant" />
  </div>
  <span class="wu-toolbar-separator" aria-hidden="true"></span>
  <Woven::Button @variant="ghost" @size="sm" @text="Export" />
  <div class="wu-toolbar-end">
    <Woven::Button @variant="brand" @size="sm" @text="Add Unit" />
  </div>
</Woven::Toolbar>`,
    toolbarSearch: `<Woven::Toolbar @bordered={{true}} @size="sm">
  <Woven::Input @size="sm" @prefixIcon="⌕" @placeholder="Search units" aria-label="Search units" />
  <div class="wu-toolbar-end">
    <Woven::Button @size="sm" @icon="funnel" @text="Filters" />
  </div>
</Woven::Toolbar>`,
  };

  panelArgRows = [
    { name: '@title', type: 'string', default: '', description: 'Kit wu-panel-title (h3) in a wu-panel-header. The header renders only when a title or header block is given.' },
  ];

  panelBlockRows = [
    { name: 'header', description: 'Content of the kit wu-panel-header; replaces the title header.' },
    { name: 'body', description: 'Content of the kit wu-panel-body. Takes precedence over the default block.' },
    { name: 'default', description: 'Body content when no named body block is given.' },
    { name: 'footer', description: 'Content of the kit wu-panel-footer.' },
  ];

  toolbarArgRows = [
    { name: '@bordered', type: 'boolean', default: 'false', description: 'Kit boxed style: border, padding and the alternate background.' },
    { name: '@size', type: '"sm"', default: '', description: 'Kit sm modifier: the smaller gap. Other values add nothing.' },
  ];

  toolbarClassRows = [
    { name: 'wu-toolbar-group', description: 'Controls that stay together.' },
    { name: 'wu-toolbar-separator', description: 'Vertical line between groups; a span with aria-hidden.' },
    { name: 'wu-toolbar-end', description: 'Pushes itself and what follows to the end.' },
  ];
}

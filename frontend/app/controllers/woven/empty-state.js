import Controller from '@ember/controller';

export default class WovenEmptyStateController extends Controller {
  code = {
    basic: `<Woven::EmptyState
  @icon="🏢"
  @title="No properties yet"
  @description="Add your first property to start tracking units, tenants, and leases."
/>`,
    actions: `<Woven::EmptyState @icon="🏢" @title="No properties yet" @description="Add your first property to start tracking units, tenants, and leases.">
  <:actions>
    <Woven::Button @variant="brand" @size="sm" @text="Add Property" />
  </:actions>
</Woven::EmptyState>`,
    iconBlock: `<Woven::EmptyState @title="Nothing to review" @description="Documents you upload will appear here.">
  <:icon><Woven::Icon @icon="tray" /></:icon>
</Woven::EmptyState>`,
    sm: `<Woven::EmptyState @icon="🔍" @size="sm" @title="No results" @description="No units match this filter." />`,
    bordered: `<Woven::EmptyState @icon="🔍" @title="No results" @description="No units match this filter." @bordered={{true}} />`,
  };

  argRows = [
    { name: '@icon', type: 'string', default: '', description: 'Glyph in the kit wu-empty-state-icon slot when no icon block is given.' },
    { name: '@title', type: 'string', default: '', description: 'Kit wu-empty-state-title paragraph.' },
    { name: '@description', type: 'string', default: '', description: 'Kit wu-empty-state-text paragraph.' },
    { name: '@size', type: '"sm" | "xs"', default: '', description: 'Kit sm, the compact size; xs renders sm. Other values render the default.' },
    { name: '@bordered', type: 'boolean', default: 'false', description: 'Kit dashed modifier: dashed border and radius.' },
  ];

  blockRows = [
    { name: 'icon', description: 'Custom icon content in the aria-hidden kit icon slot.' },
    { name: 'actions', description: 'Buttons in the kit wu-empty-state-actions row.' },
  ];
}

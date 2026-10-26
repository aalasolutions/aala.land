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
    <Woven::Button @variant="primary" @size="sm" @text="Add Property" />
  </:actions>
</Woven::EmptyState>`,
    iconBlock: `<Woven::EmptyState @title="Nothing to review" @description="Documents you upload will appear here.">
  <:icon><Woven::Icon @icon="tray" /></:icon>
</Woven::EmptyState>`,
    sm: `<Woven::EmptyState @icon="🔍" @size="sm" @title="No results" @description="No units match this filter." />`,
    lg: `<Woven::EmptyState @icon="📄" @size="lg" @title="No lease documents" @description="Upload a signed lease PDF to attach it to this unit." />`,
    bordered: `<Woven::EmptyState @icon="🔍" @title="No results" @description="No units match this filter." @bordered={{true}} />`,
    fill: `<div class="scroll-container">
  <Woven::EmptyState @title="Fills its container" @description="m-fill stretches to the parent's height." @fill={{true}} />
</div>`,
  };

  argRows = [
    { name: '@icon', type: 'string', default: '', description: 'Glyph above the title when no icon block is given.' },
    { name: '@title', type: 'string', default: '', description: 'Headline.' },
    { name: '@description', type: 'string', default: '', description: 'Supporting text.' },
    { name: '@size', type: '"sm" | "lg"', default: '', description: 'Icon and spacing step.' },
    { name: '@bordered', type: 'boolean', default: 'false', description: 'Dashed border around the block.' },
    { name: '@fill', type: 'boolean', default: 'false', description: 'Stretches to fill the parent and centres its content.' },
  ];

  blockRows = [
    { name: 'icon', description: 'Custom icon content in the aria-hidden icon slot.' },
    { name: 'actions', description: 'Buttons under the description.' },
  ];
}

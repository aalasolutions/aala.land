import Controller from '@ember/controller';

export default class NuvoEmptyStateController extends Controller {
  code = {
    basic: `<Nuvo::EmptyState
  @icon="🏢"
  @title="No properties yet"
  @description="Add your first property to start tracking units, tenants, and leases."
/>`,
    actions: `<Nuvo::EmptyState @icon="🏢" @title="No properties yet" @description="Add your first property to start tracking units, tenants, and leases.">
  <:actions>
    <Nuvo::Button @variant="primary" @size="sm" @text="Add Property" />
  </:actions>
</Nuvo::EmptyState>`,
    iconBlock: `<Nuvo::EmptyState @title="Nothing to review" @description="Documents you upload will appear here.">
  <:icon><Ui::Ph @icon="tray" /></:icon>
</Nuvo::EmptyState>`,
    sm: `<Nuvo::EmptyState @icon="🔍" @size="sm" @title="No results" @description="No units match this filter." />`,
    lg: `<Nuvo::EmptyState @icon="📄" @size="lg" @title="No lease documents" @description="Upload a signed lease PDF to attach it to this unit." />`,
    bordered: `<Nuvo::EmptyState @icon="🔍" @title="No results" @description="No units match this filter." @bordered={{true}} />`,
    fill: `<div class="scroll-container">
  <Nuvo::EmptyState @title="Fills its container" @description="m-fill stretches to the parent's height." @fill={{true}} />
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

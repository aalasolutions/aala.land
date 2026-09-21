import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_TYPE =
  '"primary" | "secondary" | "success" | "warning" | "danger" | "info"';

const ACCENT_NOTES = {
  primary: 'A highlighted or featured record.',
  secondary: 'A neutral tint to group related cards.',
  success: 'A healthy or completed record, such as a paid lease.',
  warning: 'Something due soon.',
  danger: 'Overdue rent or a blocked record.',
  info: 'An informational panel beside the main content.',
};

const STAT_NOTES = {
  default: 'A neutral figure with no judgement, such as a total count.',
  primary: 'The headline KPI of the page.',
  secondary: 'A supporting figure.',
  success: 'A figure that is on target.',
  warning: 'A figure to watch.',
  danger: 'A figure that needs action.',
  info: 'An informational figure such as open tickets.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoCardController extends Controller {
  @tracked selectedUnitId = 'unit-204';

  units = [
    { id: 'unit-204', name: 'Unit 204, Marina Tower', tenant: 'Ahmed Khalid', rent: 'AED 8,500/mo' },
    { id: 'unit-512', name: 'Unit 512, Burj Views', tenant: 'Sara Al Farsi', rent: 'AED 11,200/mo' },
    { id: 'unit-118', name: 'Unit 118, JVC Residence', tenant: 'Vacant', rent: 'AED 6,900/mo' },
  ];

  accentExamples = Object.keys(ACCENT_NOTES).map((accent) => ({
    accent,
    title: `Accent ${accent}`,
    note: ACCENT_NOTES[accent],
    code: `<Nuvo::Card @title="Accent ${accent}" @accent="${accent}">...</Nuvo::Card>`,
  }));

  statExamples = Object.keys(STAT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: STAT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Nuvo::Stat @icon="🏠" @label="Occupied units" @value="184" @delta="+4 this month" />'
        : `<Nuvo::Stat @variant="${variant}" @icon="🏠" @label="Occupied units" @value="184" @delta="+4 this month" />`,
  }));

  @action
  selectUnit(id) {
    this.selectedUnitId = id;
  }

  code = {
    title: `<Nuvo::Card @title="Marina Tower">
  <p class="nu-text m-sm m-muted">Sea-facing unit, fully furnished.</p>
</Nuvo::Card>`,
    subtitle: `<Nuvo::Card @title="Marina Tower" @subtitle="Unit 204 · 2BR">
  <p class="nu-text m-sm m-muted">Sea-facing unit, fully furnished, tenant on a 12-month lease.</p>
</Nuvo::Card>`,
    headerBlock: `<Nuvo::Card>
  <:header>
    <Nuvo::Title @tag="h3" @size="md" @text="Custom header" />
    <Nuvo::Badge @variant="success" @text="Active" />
  </:header>
  <:body>Body content.</:body>
</Nuvo::Card>`,
    slots: `<Nuvo::Card @title="Occupancy" @subtitle="This month">
  <:body>
    <p class="nu-text m-sm m-muted">Named-block body content.</p>
  </:body>
  <:footer>
    <Nuvo::Button @variant="secondary" @size="sm" @text="View report" />
  </:footer>
</Nuvo::Card>`,
    compact: `<Nuvo::Card @title="Compact" @compact={{true}}>...</Nuvo::Card>`,
    flat: `<Nuvo::Card @title="Flat" @flat={{true}}>...</Nuvo::Card>`,
    raised: `<Nuvo::Card @title="Raised" @raised={{true}}>...</Nuvo::Card>`,
    interactive: `<Nuvo::Card @title="Interactive" @interactive={{true}}>...</Nuvo::Card>`,
    selected: `<Nuvo::Card @title="Selected" @selected={{true}}>...</Nuvo::Card>`,
    statIconBlock: `<Nuvo::Stat @variant="primary" @label="Occupancy rate" @value="94%" @delta="+2.1%">
  <:icon><Nuvo::Icon @icon="buildings" /></:icon>
</Nuvo::Stat>`,
    statBare: `<Nuvo::Stat @label="Leases" @value="37" />`,
    infoRow: `<Nuvo::Card @title="Lease Summary">
  <Nuvo::InfoRow @label="Tenant" @value="Ahmed Khalid" />
  <Nuvo::InfoRow @label="Unit" @value="Marina Tower, 204" />
  <Nuvo::InfoRow @label="Rent" @value="AED 8,500/mo" />
</Nuvo::Card>`,
    infoRowBlock: `<Nuvo::InfoRow @label="Lease ends">
  <Nuvo::Badge @variant="warning" @text="42 days left" />
</Nuvo::InfoRow>`,
    infoRowClasses: `<Nuvo::InfoRow @label="Stacked" @value="Label above the value" class="m-stacked" />
<Nuvo::InfoRow @label="Borderless" @value="No divider" class="m-borderless" />`,
    listItem: `{{#each this.units as |unit|}}
  <Nuvo::ListItem>
    <:main>
      <div>
        <p class="nu-text m-sm">{{unit.name}}</p>
        <p class="nu-text m-xs m-muted">{{unit.tenant}} · {{unit.rent}}</p>
      </div>
    </:main>
    <:actions>
      <Nuvo::Button
        @variant={{if (eq this.selectedUnitId unit.id) "primary" "secondary"}}
        @size="sm"
        @text={{if (eq this.selectedUnitId unit.id) "Selected" "Select"}}
        @onClick={{fn this.selectUnit unit.id}}
      />
    </:actions>
  </Nuvo::ListItem>
{{/each}}`,
    listItemClasses: `<Nuvo::ListItem class="m-hoverable"><:main>Hoverable</:main></Nuvo::ListItem>
<Nuvo::ListItem class="m-raised"><:main>Raised</:main></Nuvo::ListItem>
<Nuvo::ListItem class="m-plain"><:main>Plain</:main></Nuvo::ListItem>`,
  };

  cardArgRows = [
    { name: '@title', type: 'string', default: '', description: 'Header title. A header renders when a title or subtitle is given.' },
    { name: '@subtitle', type: 'string', default: '', description: 'Header subtitle under the title.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Tighter padding for dense lists.' },
    { name: '@flat', type: 'boolean', default: 'false', description: 'No shadow, border only.' },
    { name: '@raised', type: 'boolean', default: 'false', description: 'Elevated shadow.' },
    { name: '@interactive', type: 'boolean', default: 'false', description: 'Hover and focus affordance for a clickable card.' },
    { name: '@accent', type: VARIANT_TYPE, default: '', description: 'Tinted surface in the given colour (m-accent plus m-{variant}).' },
    { name: '@selected', type: 'boolean', default: 'false', description: 'Primary ring border for a chosen card.' },
  ];

  cardBlockRows = [
    { name: 'header', description: 'Replaces the title/subtitle header entirely.' },
    { name: 'body', description: 'Body content. Takes precedence over the default block.' },
    { name: 'default', description: 'Body content when no named body block is given.' },
    { name: 'footer', description: 'Footer row, usually actions.' },
  ];

  statArgRows = [
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Colour of the icon well and delta.' },
    { name: '@icon', type: 'string', default: '', description: 'Glyph in the icon well when no icon block is given.' },
    { name: '@label', type: 'string', default: '', description: 'Caption above the value.' },
    { name: '@value', type: 'string | number', default: '', description: 'The headline figure. Always rendered.' },
    { name: '@delta', type: 'string', default: '', description: 'Trend or context line under the value.' },
    { name: '@contentBleed', type: 'boolean', default: 'false', description: 'Adds m-bleed to the content block so it reaches the card edge; for a sparkline, not for text.' },
  ];

  statBlockRows = [
    { name: 'icon', description: 'Custom icon content in the aria-hidden icon well.' },
    { name: 'content', description: 'Trails the value and delta, for a sparkline or a note.' },
  ];

  infoRowArgRows = [
    { name: '@label', type: 'string', default: '', description: 'Leading label.' },
    { name: '@value', type: 'string', default: '', description: 'Trailing value when no block is given.' },
  ];

  infoRowBlockRows = [
    { name: 'default', description: 'Value content, for badges or links instead of plain text.' },
  ];

  listItemBlockRows = [
    { name: 'main', description: 'Primary content, fills the row.' },
    { name: 'actions', description: 'Trailing controls.' },
  ];

  // Modifiers the sheets ship that no argument maps to; pass them through class.
  classRows = [
    { name: 'nu-stat__content.m-bleed', description: 'Cancels the card padding so the content block reaches the card edge. Set it with @contentBleed.' },
    { name: 'nu-info-row.m-stacked', description: 'Label above the value instead of beside it.' },
    { name: 'nu-info-row.m-borderless', description: 'Removes the row divider.' },
    { name: 'nu-list-item.m-raised', description: 'Elevated shadow on the row.' },
    { name: 'nu-list-item.m-hoverable', description: 'Background change on hover.' },
    { name: 'nu-list-item.m-plain', description: 'No border or background.' },
  ];
}

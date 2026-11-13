import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const STAT_NOTES = {
  default: 'A neutral change line, muted, for a figure with no judgment such as a total count. brand, warning, info and secondary render the same.',
  success: 'The change line turns success: a figure that is on target.',
  danger: 'The change line turns danger: a figure that needs action.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenCardController extends Controller {
  @tracked selectedUnitId = 'unit-204';

  units = [
    { id: 'unit-204', name: 'Unit 204, Marina Tower', tenant: 'Ahmed Khalid', rent: 'AED 8,500/mo' },
    { id: 'unit-512', name: 'Unit 512, Burj Views', tenant: 'Sara Al Farsi', rent: 'AED 11,200/mo' },
    { id: 'unit-118', name: 'Unit 118, JVC Residence', tenant: 'Vacant', rent: 'AED 6,900/mo' },
  ];

  statExamples = Object.keys(STAT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: STAT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Woven::Stat @label="Occupied units" @value="184" @delta="+4 this month" />'
        : `<Woven::Stat @variant="${variant}" @label="Occupied units" @value="184" @delta="+4 this month" />`,
  }));

  @action
  selectUnit(id) {
    this.selectedUnitId = id;
  }

  code = {
    title: `<Woven::Card @title="Marina Tower">
  <p class="wu-text sm muted">Sea-facing unit, fully furnished.</p>
</Woven::Card>`,
    subtitle: `<Woven::Card @title="Marina Tower" @subtitle="Unit 204 · 2BR">
  <p class="wu-text sm muted">Sea-facing unit, fully furnished, tenant on a 12-month lease.</p>
</Woven::Card>`,
    headerBlock: `<Woven::Card>
  <:header>
    <h3 class="wu-card-title">Custom header</h3>
    <Woven::Tag @variant="success" @text="Active" />
  </:header>
  <:body>Body content.</:body>
</Woven::Card>`,
    slots: `<Woven::Card @title="Occupancy" @subtitle="This month">
  <:body>
    <p class="wu-text sm muted">Named-block body content.</p>
  </:body>
  <:footer>
    <Woven::Button @size="sm" @text="View report" />
  </:footer>
</Woven::Card>`,
    linked: `<Woven::Card>
  <h3 class="wu-card-title">
    <a class="wu-card-link" href="#card-slots">Marina Tower</a>
  </h3>
  <p class="wu-text sm muted">The whole card is one link target.</p>
</Woven::Card>`,
    statInCard: `<Woven::Card>
  <Woven::Stat @variant="success" @label="Occupancy rate" @value="94%" @delta="+2.1% this month" />
</Woven::Card>`,
    statSizes: `<Woven::Stat @size="sm" @label="Small" @value="37" />
<Woven::Stat @label="Default" @value="37" />
<Woven::Stat @size="lg" @label="Large" @value="37" />`,
    statRoute: `<Woven::Stat @route="woven.card" @label="Open leases" @value="37" />`,
    statBare: `<Woven::Stat @label="Leases" @value="37" />`,
    infoRow: `<Woven::Card @title="Lease Summary">
  <Woven::InfoRow @label="Tenant" @value="Ahmed Khalid" />
  <Woven::InfoRow @label="Unit" @value="Marina Tower, 204" />
  <Woven::InfoRow @label="Rent" @value="AED 8,500/mo" />
</Woven::Card>`,
    infoRowBlock: `<Woven::InfoRow @label="Lease ends">
  <Woven::Badge @variant="warning" @text="42 days left" />
</Woven::InfoRow>`,
    infoRowClasses: `<Woven::InfoRow @label="Rent" @value="AED 120,000" />
<Woven::InfoRow @label="Total" @value="AED 129,600" class="total" />`,
    listItem: `{{#each this.units as |unit|}}
  <Woven::ListItem>
    <:main>
      <div>
        <p class="wu-text sm">{{unit.name}}</p>
        <p class="wu-text sm muted">{{unit.tenant}} · {{unit.rent}}</p>
      </div>
    </:main>
    <:actions>
      <Woven::Button
        @variant={{if (eq this.selectedUnitId unit.id) "brand"}}
        @size="sm"
        @text={{if (eq this.selectedUnitId unit.id) "Selected" "Select"}}
        @onClick={{fn this.selectUnit unit.id}}
      />
    </:actions>
  </Woven::ListItem>
{{/each}}`,
  };

  cardArgRows = [
    { name: '@title', type: 'string', default: '', description: 'Kit wu-card-title (h3) in a wu-card-header. A header renders when a title or subtitle is given.' },
    { name: '@subtitle', type: 'string', default: '', description: 'Header subtitle under the title.' },
  ];

  cardBlockRows = [
    { name: 'header', description: 'Content of the kit wu-card-header; replaces the title and subtitle header.' },
    { name: 'body', description: 'Content of the kit wu-card-body. Takes precedence over the default block.' },
    { name: 'default', description: 'Body content when no named body block is given.' },
    { name: 'footer', description: 'Content of the kit wu-card-footer, usually actions aligned to the end.' },
  ];

  statArgRows = [
    { name: '@label', type: 'string', default: '', description: 'Kit wu-stat-label, muted, above the value.' },
    { name: '@value', type: 'string | number', default: '', description: 'Kit wu-stat-value, the headline figure. Always rendered.' },
    { name: '@delta', type: 'string', default: '', description: 'Kit wu-stat-delta change line under the value.' },
    { name: '@variant', type: '"success" | "danger"', default: '', description: 'Role modifier on the change line only. Other values render the muted change line.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg value size; xs renders sm and xl renders lg.' },
    { name: '@icon', type: 'string', default: '', description: 'Glyph in an aria-hidden span. The kit has no icon part, so it renders unstyled.' },
    { name: '@route', type: 'string', default: '', description: 'Renders the stat as a LinkTo; @model, @models and @query pass through.' },
    { name: '@href', type: 'string', default: '', description: 'Renders the stat as an anchor.' },
  ];

  statBlockRows = [
    { name: 'icon', description: 'Custom content in an aria-hidden span (no kit styling).' },
    { name: 'content', description: 'Trails the value and delta in a plain div (no kit styling), for a sparkline or a note.' },
  ];

  infoRowArgRows = [
    { name: '@label', type: 'string', default: '', description: 'Leading label.' },
    { name: '@value', type: 'string', default: '', description: 'Trailing value when no block is given.' },
  ];

  infoRowBlockRows = [
    { name: 'default', description: 'Value content, for badges or links instead of plain text.' },
  ];

  listItemBlockRows = [
    { name: 'main', description: 'Primary content in a growing flex row (core flex x-center gap-3 grow).' },
    { name: 'actions', description: 'Trailing controls in a flex row.' },
  ];

  // Modifiers the sheets ship that no argument maps to; pass them through class.
  classRows = [
    { name: 'wu-info-row total', description: 'Strong line above, regular label text and a larger value.' },
    { name: 'wu-card-link', description: 'Link stretched over the whole card; put it on the one real link, usually in the title.' },
  ];
}

import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_TYPE =
  '"primary" | "secondary" | "success" | "warning" | "danger" | "info"';

const VARIANT_NOTES = {
  default: 'Neutral note with no colour meaning, for context that is neither good nor bad.',
  primary: 'A brand-coloured announcement, such as a new feature or a promotion.',
  secondary: 'A quieter neutral for secondary notes beside a primary one.',
  success: 'Something completed: rent collected, lease signed.',
  warning: 'Something to check soon: a bounced cheque, an expiring document.',
  danger: 'Something broken or blocking: overdue maintenance, a failed sync.',
  info: 'Helpful context: counts, reminders, what happens next.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoAlertController extends Controller {
  @tracked alertDismissed = false;

  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Nuvo::Alert @icon="ℹ" @title="Default alert" />'
        : `<Nuvo::Alert @variant="${variant}" @icon="ℹ" @title="${capitalize(variant)} alert" />`,
  }));

  @action
  dismissAlert() {
    this.alertDismissed = true;
  }

  @action
  resetAlert() {
    this.alertDismissed = false;
  }

  code = {
    description: `<Nuvo::Alert
  @variant="success"
  @icon="✓"
  @title="Rent collected"
  @description="AED 42,000 was collected across 6 units this week."
/>`,
    noIcon: `<Nuvo::Alert @variant="info" @icon="ℹ" @showIcon={{false}} @title="Icon suppressed" @description="showIcon false keeps the data but hides the glyph." />`,
    closable: `{{#if this.alertDismissed}}
  <Nuvo::Button @variant="link" @size="sm" @text="Reset" @onClick={{this.resetAlert}} />
{{else}}
  <Nuvo::Alert
    @variant="danger"
    @icon="⛔"
    @title="Maintenance overdue"
    @description="Unit 118, JVC Residence has an unresolved AC repair ticket open for 9 days."
    @closable={{true}}
    @onClose={{this.dismissAlert}}
  />
{{/if}}`,
    inline: `<Nuvo::Alert @variant="info" @icon="ℹ" @inline={{true}} @title="Inline alert" @description="stays on one line" />`,
    banner: `<Nuvo::Alert @variant="primary" @icon="🏠" @banner={{true}} @title="Banner alert spans full width" />`,
    block: `<Nuvo::Alert @variant="warning" @icon="⚠">
  <strong>Custom body.</strong> Block content replaces title and description.
</Nuvo::Alert>`,
    actions: `<Nuvo::Alert @variant="warning" @icon="⚠" @title="Cheque bounced" @description="Post-dated cheque #4821 was returned by the bank.">
  <:actions>
    <Nuvo::Button @variant="secondary" @size="sm" @text="Contact tenant" />
    <Nuvo::Button @variant="ghost" @size="sm" @text="Dismiss" />
  </:actions>
</Nuvo::Alert>`,
  };

  argRows = [
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Colour scale. Omit for the neutral alert.' },
    { name: '@icon', type: 'string', default: '', description: 'Glyph in the icon slot. Grows (is-large) when a description is present.' },
    { name: '@showIcon', type: 'boolean', default: 'true', description: 'Set false to hide the icon while keeping @icon in the data.' },
    { name: '@title', type: 'string', default: '', description: 'Bold first line.' },
    { name: '@description', type: 'string', default: '', description: 'Body text under the title.' },
    { name: '@inline', type: 'boolean', default: 'false', description: 'Title and description on one line for compact rows.' },
    { name: '@banner', type: 'boolean', default: 'false', description: 'Edge-to-edge bar without radius, for page-level notices.' },
    { name: '@closable', type: 'boolean', default: 'false', description: 'Renders a dismiss button and adds is-dismissible.' },
  ];

  callbackRows = [
    { name: '@onClose', signature: '(event)', description: 'Dismiss button pressed. The caller hides the alert; the component does not.' },
  ];

  blockRows = [
    { name: 'default', description: 'Custom content; replaces title and description.' },
    { name: 'actions', description: 'Buttons under the content.' },
  ];
}

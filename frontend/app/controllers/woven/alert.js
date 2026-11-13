import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_TYPE = '"brand" | "success" | "warning" | "danger" | "info"';

const VARIANT_NOTES = {
  default: 'Neutral note with no color meaning, for context that is neither good nor bad. secondary renders the same.',
  brand: 'A brand-colored announcement, such as a new feature or a promotion.',
  success: 'Something completed: rent collected, lease signed.',
  warning: 'Something to check soon: a bounced cheque, an expiring document.',
  danger: 'Something broken or blocking: overdue maintenance, a failed sync.',
  info: 'Helpful context: counts, reminders, what happens next.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenAlertController extends Controller {
  @tracked alertDismissed = false;

  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Woven::Alert @title="Default alert" />'
        : `<Woven::Alert @variant="${variant}" @title="${capitalize(variant)} alert" />`,
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
    description: `<Woven::Alert
  @variant="success"
  @title="Rent collected"
  @description="AED 42,000 was collected across 6 units this week."
/>`,
    closable: `{{#if this.alertDismissed}}
  <Woven::Button @variant="link" @size="sm" @text="Reset" @onClick={{this.resetAlert}} />
{{else}}
  <Woven::Alert
    @variant="danger"
    @title="Maintenance overdue"
    @description="Unit 118, JVC Residence has an unresolved AC repair ticket open for 9 days."
    @closable={{true}}
    @onClose={{this.dismissAlert}}
  />
{{/if}}`,
    block: `<Woven::Alert @variant="warning">
  <strong class="wu-alert-title">Document expiring</strong>
  <p>The trade license for Marina Heights expires in <strong>12 days</strong>.</p>
</Woven::Alert>`,
    actions: `<Woven::Alert @variant="warning" @title="Cheque bounced" @description="Post-dated cheque #4821 was returned by the bank.">
  <:actions>
    <Woven::Button @size="sm" @text="Contact tenant" />
    <Woven::Button @variant="ghost" @size="sm" @text="Dismiss" />
  </:actions>
</Woven::Alert>`,
    status: `<Woven::Alert @variant="info" @title="Sync scheduled" @description="Listings refresh every night at 02:00." role="status" />`,
  };

  argRows = [
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Kit role modifier of the same name. Omit, or pass secondary, for the neutral alert.' },
    { name: '@title', type: 'string', default: '', description: 'Bold first line in the kit wu-alert-title part.' },
    { name: '@description', type: 'string', default: '', description: 'Paragraph under the title.' },
    { name: '@closable', type: 'boolean', default: 'false', description: 'Renders the kit wu-alert-close button as the last child.' },
  ];

  callbackRows = [
    { name: '@onClose', signature: '(event)', description: 'Dismiss button pressed. The caller hides the alert; the component does not.' },
  ];

  blockRows = [
    { name: 'default', description: 'Custom content; replaces title and description.' },
    { name: 'actions', description: 'Buttons in the kit wu-alert-actions row under the content.' },
  ];
}
